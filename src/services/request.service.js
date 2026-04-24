import { Injectable, Dependencies, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BalanceService } from './balance.service.js';
import { HcmClientService } from './hcm-client.service.js';
import { TimeOffRequest } from '../entities/time-off-request.entity.js';
import { HcmRetryJob } from '../entities/hcm-retry-job.entity.js';
import { RequestStatus } from '../common/enums/request-status.enum.js';
import { RetryStatus } from '../common/enums/retry-status.enum.js';
import { LeaveBalance } from '../entities/leave-balance.entity.js';

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

    // 2. Capture pre-deduction balance for strict arithmetic reconciliation
    const balanceRepo = this.dataSource.getRepository(LeaveBalance);
    const preBalanceEntity = await balanceRepo.findOne({
      where: { employeeId: request.employeeId, locationId: request.locationId, leaveType: request.leaveType }
    });
    const preDeductionBalance = preBalanceEntity ? Number(preBalanceEntity.balance) : 0;

    // 3. Reserve Balance Optimistically
    try {
      await this.balanceService.reserveBalance(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
    } catch (error) {
      request.status = RequestStatus.REJECTED;
      request.notes = 'Failed to reserve balance: ' + error.message;
      await requestRepo.save(request);
      return request;
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
      this.logger.warn(`HCM Sync failed for request ${request.id}. Moving to HCM_ERROR.`);
      request.status = RequestStatus.HCM_ERROR;
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
        status: RetryStatus.QUEUED
      });
      return request;
    }

    // 4. Defensive GET-after-POST
    try {
      const hcmBalanceResponse = await this.hcmClientService.getBalance(request.employeeId, request.locationId, request.leaveType);

      // Determine if we should approve or flag using strict arithmetic reconciliation.
      // TRD Requirement: Ensure local math matches remote HCM state exactly.
      const expectedBalance = preDeductionBalance - request.daysRequested;
      const actualBalance = hcmBalanceResponse ? Number(hcmBalanceResponse.balance) : null;
      
      // TRD Section 6.2: 0.01 days rounding tolerance prevents false alarms from floating-point drift
      const tolerance = 0.01;
      const verificationSucceeded = actualBalance !== null && Math.abs(actualBalance - expectedBalance) < tolerance;

      if (!verificationSucceeded) {
        this.logger.warn(`Arithmetic reconciliation failed for request ${request.id}. Expected: ${expectedBalance}, Got: ${actualBalance}`);
      }

      if (verificationSucceeded) {
        await this.balanceService.commitReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
        request.status = RequestStatus.APPROVED;
      } else {
        request.status = RequestStatus.HCM_ERROR;
        request.notes = 'Defensive GET-after-POST verification failed. Balances may be out of sync.';
        try {
          await this.balanceService.rollbackReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
        } catch (rollbackError) {
          this.logger.error(`Rollback failed for request ${request.id}`, rollbackError.stack);
          request.notes += ` | Rollback failed: ${rollbackError.message}`;
        }
      }
    } catch (error) {
      // GET failed after successful POST
      request.status = RequestStatus.HCM_ERROR;
      request.notes = 'Failed to verify HCM balance after successful POST.';
      this.logger.error(`Failed to verify HCM balance for request ${request.id}`, error.stack);
      try {
        await this.balanceService.rollbackReservation(request.employeeId, request.locationId, request.leaveType, request.daysRequested);
      } catch (rollbackError) {
        this.logger.error(`Rollback failed for request ${request.id}`, rollbackError.stack);
        request.notes += ` | Rollback failed: ${rollbackError.message}`;
      }
    }

    await requestRepo.save(request);
    return request;
  }

  /**
   * Retrieves all time-off requests for a specific employee.
   * 
   * @param {string} employeeId 
   * @returns {Promise<TimeOffRequest[]>}
   */
  async findAllByEmployee(employeeId) {
    const requestRepo = this.dataSource.getRepository(TimeOffRequest);
    return await requestRepo.find({
      where: { employeeId },
      order: { requestedAt: 'DESC' }
    });
  }
}
