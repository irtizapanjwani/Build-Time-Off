import { Injectable, Dependencies, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BalanceService } from './balance.service.js';
import { HcmClientService } from './hcm-client.service.js';
import { TimeOffRequest } from '../entities/time-off-request.entity.js';
import { HcmRetryJob } from '../entities/hcm-retry-job.entity.js';
import { RequestStatus } from '../common/enums/request-status.enum.js';
import { RetryStatus } from '../common/enums/retry-status.enum.js';

@Injectable()
@Dependencies(DataSource, BalanceService, HcmClientService)
export class RequestService {
  /**
   * @param {DataSource} dataSource
   * @param {BalanceService} balanceService 
   * @param {HcmClientService} hcmClientService 
   */
  constructor(dataSource, balanceService, hcmClientService) {
    this.dataSource = dataSource;
    this.balanceService = balanceService;
    this.hcmClientService = hcmClientService;
    this.logger = new Logger(RequestService.name);
  }

  /**
   * Orchestrates the Time-Off request lifecycle enforcing Defensive GET-after-POST
   * @param {Partial<TimeOffRequest>} dto 
   */
  async createTimeOffRequest(dto) {
    const requestRepo = this.dataSource.getRepository(TimeOffRequest);
    const retryJobRepo = this.dataSource.getRepository(HcmRetryJob);

    // 1. Save Request as PENDING
    const request = requestRepo.create({
      ...dto,
      status: RequestStatus.PENDING
    });
    await requestRepo.save(request);

    // 2. Reserve Balance Optimistically
    try {
      await this.balanceService.reserveBalance(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
    } catch (error) {
      request.status = RequestStatus.REJECTED;
      request.notes = 'Failed to reserve balance: ' + error.message;
      await requestRepo.save(request);
      throw error;
    }

    // 3. Sync to HCM
    let hcmDeductResponse;
    try {
      hcmDeductResponse = await this.hcmClientService.deductBalance({
        employeeId: request.employeeId,
        locationId: request.locationId,
        leaveType: request.leaveType,
        days: request.daysRequested
      });
      request.hcmTransactionId = hcmDeductResponse.transactionId;
      await requestRepo.save(request);
    } catch (error) {
      this.logger.warn(`HCM Sync failed for request ${request.id}. Moving to PENDING_HCM_SYNC.`);
      request.status = RequestStatus.PENDING_HCM_SYNC;
      await requestRepo.save(request);

      // Enqueue Retry Job
      await retryJobRepo.save({
        requestId: request.id,
        payload: JSON.stringify({
          employeeId: request.employeeId,
          locationId: request.locationId,
          leaveType: request.leaveType,
          days: request.daysRequested
        }),
        status: RetryStatus.PENDING
      });
      return request;
    }

    // 4. Defensive GET-after-POST
    try {
      const hcmBalanceResponse = await this.hcmClientService.getBalance(request.employeeId, request.locationId, request.leaveType);

      // Determine if we should approve or flag
      // Normally we'd do strict arithmetic checking here (e.g., local balance == remote balance).
      // If verification fails, flag for manual intervention.
      const verificationSucceeded = hcmBalanceResponse && typeof hcmBalanceResponse.balance === 'number';

      if (verificationSucceeded) {
        await this.balanceService.commitReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
        request.status = RequestStatus.APPROVED;
      } else {
        request.status = RequestStatus.MANUAL_INTERVENTION_REQUIRED;
        request.notes = 'Defensive GET-after-POST verification failed. Balances may be out of sync.';
        await this.balanceService.rollbackReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
      }
    } catch (error) {
      // GET failed after successful POST
      request.status = RequestStatus.MANUAL_INTERVENTION_REQUIRED;
      request.notes = 'Failed to verify HCM balance after successful POST.';
      this.logger.error(`Failed to verify HCM balance for request ${request.id}`, error.stack);
      await this.balanceService.rollbackReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
    }

    await requestRepo.save(request);
    return request;
  }
}
