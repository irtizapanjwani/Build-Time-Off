import { Injectable, Dependencies, Logger } from '@nestjs/common';
import { DataSource, OptimisticLockVersionMismatchError } from 'typeorm';
import { LeaveBalance } from '../entities/leave-balance.entity.js';

/**
 * @typedef {import('../common/enums/leave-type.enum').LeaveType} LeaveType
 */

@Injectable()
@Dependencies(DataSource)
export class BalanceService {
  /**
   * @param {DataSource} dataSource
   */
  constructor(dataSource) {
    this.dataSource = dataSource;
    this.logger = new Logger(BalanceService.name);
  }

  /**
   * Helper to execute a database operation with optimistic lock retry logic.
   * 
   * @param {Function} operation Async operation receiving a EntityManager
   * @param {string} contextMsg Context for logging
   * @param {number} maxRetries 
   */
  async _withOptimisticRetry(operation, contextMsg, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const result = await operation(queryRunner.manager);
        await queryRunner.commitTransaction();
        return result;
      } catch (error) {
        await queryRunner.rollbackTransaction();

        if (error instanceof OptimisticLockVersionMismatchError) {
          this.logger.warn(`${contextMsg} version mismatch (Attempt ${attempt}/${maxRetries})`);
          if (attempt >= maxRetries) {
            this.logger.error(`Failed ${contextMsg.toLowerCase()} after ${maxRetries} attempts due to concurrent updates.`);
            throw new Error(`Concurrent modification error during ${contextMsg.toLowerCase()}. Please try again later.`);
          }
          continue;
        }
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
  }

  /**
   * Reserves balance for a time-off request using Optimistic Locking.
   * 
   * @param {string} employeeId 
   * @param {string} locationId 
   * @param {LeaveType} leaveType 
   * @param {number} daysRequested 
   * @returns {Promise<LeaveBalance>}
   */
  async reserveBalance(employeeId, locationId, leaveType, daysRequested) {
    return this._withOptimisticRetry(async (manager) => {
      const leaveBalance = await manager.findOne(LeaveBalance, {
        where: { employeeId, locationId, leaveType }
      });

      if (!leaveBalance) {
        throw new Error('Leave balance not found');
      }

      const availableBalance = Number(leaveBalance.balance) - Number(leaveBalance.pendingDeductions);
      if (availableBalance < daysRequested) {
        throw new Error('Insufficient available balance');
      }

      const newPending = Number(leaveBalance.pendingDeductions) + daysRequested;

      // Explicit update with version check to satisfy strict optimistic locking requirements
      const updateResult = await manager.update(LeaveBalance,
        { id: leaveBalance.id, version: leaveBalance.version },
        { pendingDeductions: newPending }
      );

      if (updateResult.affected === 0) {
        throw new OptimisticLockVersionMismatchError();
      }

      return manager.findOne(LeaveBalance, { where: { id: leaveBalance.id } });
    }, `Reserving balance for ${employeeId}`);
  }

  /**
   * Confirms a reservation by deducting from both pending and actual balance.
   * 
   * @param {string} employeeId 
   * @param {string} locationId 
   * @param {LeaveType} leaveType 
   * @param {number} daysRequested 
   * @returns {Promise<LeaveBalance>}
   */
  async commitReservation(employeeId, locationId, leaveType, daysRequested) {
    return this._withOptimisticRetry(async (manager) => {
      const leaveBalance = await manager.findOne(LeaveBalance, {
        where: { employeeId, locationId, leaveType }
      });

      if (!leaveBalance) {
        throw new Error('Leave balance not found');
      }

      if (Number(leaveBalance.pendingDeductions) < daysRequested) {
        throw new Error('Invalid state: pendingDeductions less than daysRequested');
      }

      const newBalance = Number(leaveBalance.balance) - daysRequested;
      const newPending = Number(leaveBalance.pendingDeductions) - daysRequested;

      const updateResult = await manager.update(LeaveBalance,
        { id: leaveBalance.id, version: leaveBalance.version },
        { 
          balance: newBalance,
          pendingDeductions: newPending 
        }
      );

      if (updateResult.affected === 0) {
        throw new OptimisticLockVersionMismatchError();
      }

      return manager.findOne(LeaveBalance, { where: { id: leaveBalance.id } });
    }, `Committing reservation for ${employeeId}`);
  }

  /**
   * Rolls back a reservation by removing days from pendingDeductions.
   * 
   * @param {string} employeeId 
   * @param {string} locationId 
   * @param {LeaveType} leaveType 
   * @param {number} daysRequested 
   * @returns {Promise<LeaveBalance>}
   */
  async rollbackReservation(employeeId, locationId, leaveType, daysRequested) {
    return this._withOptimisticRetry(async (manager) => {
      const leaveBalance = await manager.findOne(LeaveBalance, {
        where: { employeeId, locationId, leaveType }
      });

      if (!leaveBalance) {
        throw new Error('Leave balance not found during rollback');
      }

      if (Number(leaveBalance.pendingDeductions) < daysRequested) {
        throw new Error('Invalid state: pendingDeductions less than daysRequested during rollback');
      }

      const newPending = Number(leaveBalance.pendingDeductions) - daysRequested;

      const updateResult = await manager.update(LeaveBalance,
        { id: leaveBalance.id, version: leaveBalance.version },
        { pendingDeductions: newPending }
      );

      if (updateResult.affected === 0) {
        throw new OptimisticLockVersionMismatchError();
      }

      return manager.findOne(LeaveBalance, { where: { id: leaveBalance.id } });
    }, `Rolling back reservation for ${employeeId}`);
  }
}
