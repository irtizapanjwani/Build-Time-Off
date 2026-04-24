import { Injectable, Dependencies, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, LessThan, OptimisticLockVersionMismatchError } from 'typeorm';
import { HcmRetryJob } from '../entities/hcm-retry-job.entity.js';
import { TimeOffRequest } from '../entities/time-off-request.entity.js';
import { RequestStatus } from '../common/enums/request-status.enum.js';
import { RetryStatus } from '../common/enums/retry-status.enum.js';
import { HcmClientService } from '../services/hcm-client.service.js';
import { BalanceService } from '../services/balance.service.js';

@Injectable()
@Dependencies(DataSource, HcmClientService, BalanceService)
export class HcmRetryWorker {
  /**
   * @param {DataSource} dataSource 
   * @param {HcmClientService} hcmClientService 
   * @param {BalanceService} balanceService 
   */
  constructor(dataSource, hcmClientService, balanceService) {
    this.dataSource = dataSource;
    this.hcmClientService = hcmClientService;
    this.balanceService = balanceService;
    this.logger = new Logger(HcmRetryWorker.name);
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    this.logger.debug('Running HCM Retry Worker');
    const retryJobRepo = this.dataSource.getRepository(HcmRetryJob);
    const requestRepo = this.dataSource.getRepository(TimeOffRequest);

    // Fetch up to 10 queued jobs atomically to prevent concurrent processing
    const rawJobs = await retryJobRepo.query(`
      UPDATE hcm_retry_job
      SET status = '${RetryStatus.PROCESSING}'
      WHERE id IN (
        SELECT id FROM hcm_retry_job
        WHERE status = '${RetryStatus.QUEUED}'
        ORDER BY lastAttemptAt ASC NULLS FIRST
        LIMIT 10
      )
      RETURNING *
    `);
    
    // Fallback to empty array if no jobs returned
    const jobs = Array.isArray(rawJobs) ? rawJobs : [];

    if (jobs.length === 0) return;

    for (const job of jobs) {
      job.attempts++;
      job.lastAttemptAt = new Date();

      try {
        const payload = JSON.parse(job.payload);
        
        // 1. Re-attempt POST
        const hcmDeductResponse = await this.hcmClientService.deductBalance(payload);
        
        // 2. Fetch related request
        let request = await requestRepo.findOne({ where: { id: job.requestId } });
        if (!request) {
          this.logger.error(`Request ${job.requestId} not found for retry job ${job.id}`);
          job.status = RetryStatus.FAILED;
          await retryJobRepo.save(job);
          continue;
        }

        request.hcmTransactionId = hcmDeductResponse.transactionId;
        
        // 3. Re-attempt GET-after-POST
        try {
          const hcmBalanceResponse = await this.hcmClientService.getBalance(request.employeeId, request.locationId, request.leaveType);
          const verificationSucceeded = hcmBalanceResponse && typeof hcmBalanceResponse.balance === 'number';
          
          if (verificationSucceeded) {
            await this.balanceService.commitReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
            request.status = RequestStatus.APPROVED;
          } else {
            request.status = RequestStatus.HCM_ERROR;
            request.notes = 'Defensive GET-after-POST verification failed during retry.';
            try {
              await this.balanceService.rollbackReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
            } catch (rollbackError) {
              this.logger.error(`Rollback failed for request ${request.id}`, rollbackError.stack);
              request.notes += ` | Rollback failed: ${rollbackError.message}`;
            }
          }
        } catch (error) {
          request.status = RequestStatus.HCM_ERROR;
          request.notes = 'Failed to verify HCM balance during retry.';
          try {
            await this.balanceService.rollbackReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
          } catch (rollbackError) {
            this.logger.error(`Rollback failed for request ${request.id}`, rollbackError.stack);
            request.notes += ` | Rollback failed: ${rollbackError.message}`;
          }
        }
        
        let saveAttempt = 0;
        let saved = false;
        while (saveAttempt < 3 && !saved) {
          saveAttempt++;
          try {
            await requestRepo.save(request);
            saved = true;
          } catch (err) {
            if (err instanceof OptimisticLockVersionMismatchError) {
              if (saveAttempt >= 3) throw new Error('Failed to save request after max optimistic lock retries.');
              const freshRequest = await requestRepo.findOne({ where: { id: request.id } });
              if (freshRequest) {
                freshRequest.status = request.status;
                freshRequest.notes = request.notes;
                freshRequest.hcmTransactionId = request.hcmTransactionId;
                request = freshRequest;
              }
              continue;
            }
            throw err;
          }
        }

        job.status = RetryStatus.COMPLETED;
        await retryJobRepo.save(job);
        this.logger.log(`Successfully retried HCM job ${job.id}`);

      } catch (error) {
        this.logger.error(`HCM retry failed for job ${job.id}: ${error.message}`);
        
        // TRD Section 6.3: Max retry window of 4 hours
        const fourHoursMs = 4 * 60 * 60 * 1000;
        const jobAgeMs = Date.now() - new Date(job.createdAt).getTime();
        const isExpired = jobAgeMs > fourHoursMs;

        if (isExpired) {
          this.logger.error(`HCM retry job ${job.id} expired after 4 hours. Moving to FAILED.`);
          job.status = RetryStatus.FAILED;
          const request = await requestRepo.findOne({ where: { id: job.requestId } });
          if (request) {
            request.status = RequestStatus.HCM_ERROR;
            request.notes = 'Failed to sync with HCM after maximum retries.';
            // Release the reserved balance
            try {
              await this.balanceService.rollbackReservation(
                request.employeeId, 
                request.locationId, 
                request.leaveType, 
                request.daysRequested
              );
            } catch (rollbackError) {
              this.logger.error(`Rollback failed for request ${request.id}`, rollbackError.stack);
              request.notes += ` | Rollback failed: ${rollbackError.message}`;
            }
            
            let saveAttempt = 0;
            let saved = false;
            while (saveAttempt < 3 && !saved) {
              saveAttempt++;
              try {
                await requestRepo.save(request);
                saved = true;
              } catch (err) {
                if (err instanceof OptimisticLockVersionMismatchError) {
                  if (saveAttempt >= 3) throw new Error('Failed to save request after max optimistic lock retries.');
                  const freshRequest = await requestRepo.findOne({ where: { id: request.id } });
                  if (freshRequest) {
                    freshRequest.status = request.status;
                    freshRequest.notes = request.notes;
                    request = freshRequest;
                  }
                  continue;
                }
                throw err;
              }
            }
          }
        }
        await retryJobRepo.save(job);
      }
    }
  }
}
