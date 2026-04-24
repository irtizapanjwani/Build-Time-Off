import { Injectable, Dependencies, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LeaveBalance } from '../entities/leave-balance.entity.js';
import { OptimisticLockVersionMismatchError } from 'typeorm';

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
   * Reserves balance for a time-off request using Optimistic Locking.
   * Includes a 3-count retry loop for handling concurrent updates.
   * 
   * @param {string} employeeId 
   * @param {string} locationId 
   * @param {LeaveType} leaveType 
   * @param {number} daysRequested 
   * @returns {Promise<LeaveBalance>}
   */
  async reserveBalance(employeeId, locationId, leaveType, daysRequested) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const balanceRepo = queryRunner.manager.getRepository(LeaveBalance);

        // Fetch balance without pessimistic locking; we rely on the version column
        const leaveBalance = await balanceRepo.findOne({
          where: { employeeId, locationId, leaveType }
        });

        if (!leaveBalance) {
          throw new Error('Leave balance not found');
        }

        const availableBalance = Number(leaveBalance.balance) - Number(leaveBalance.pendingDeductions);
        
        if (availableBalance < daysRequested) {
          throw new Error('Insufficient available balance');
        }

        // Apply reservation
        leaveBalance.pendingDeductions = Number(leaveBalance.pendingDeductions) + daysRequested;

        // Save attempts to increment version. Throws OptimisticLockVersionMismatchError on conflict
        const savedBalance = await balanceRepo.save(leaveBalance);

        await queryRunner.commitTransaction();
        this.logger.log(`Successfully reserved ${daysRequested} days for ${employeeId} on attempt ${attempt}`);
        return savedBalance;

      } catch (error) {
        await queryRunner.rollbackTransaction();

        if (error instanceof OptimisticLockVersionMismatchError) {
          this.logger.warn(`Version mismatch reserving balance for ${employeeId} (Attempt ${attempt}/${maxRetries})`);
          if (attempt >= maxRetries) {
            this.logger.error(`Failed to reserve balance after ${maxRetries} attempts due to concurrent updates.`);
            throw new Error('Concurrent modification error. Please try again later.');
          }
          // Loop continues for a retry
          continue;
        }

        // Re-throw non-version errors
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
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
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const balanceRepo = queryRunner.manager.getRepository(LeaveBalance);
        const leaveBalance = await balanceRepo.findOne({
          where: { employeeId, locationId, leaveType }
        });

        if (!leaveBalance) {
          throw new Error('Leave balance not found');
        }

        if (Number(leaveBalance.pendingDeductions) < daysRequested) {
          throw new Error('Invalid state: pendingDeductions less than daysRequested');
        }

        leaveBalance.balance = Number(leaveBalance.balance) - daysRequested;
        leaveBalance.pendingDeductions = Number(leaveBalance.pendingDeductions) - daysRequested;

        const savedBalance = await balanceRepo.save(leaveBalance);
        await queryRunner.commitTransaction();
        return savedBalance;

      } catch (error) {
        await queryRunner.rollbackTransaction();

        if (error instanceof OptimisticLockVersionMismatchError) {
          this.logger.warn(`Version mismatch committing reservation for ${employeeId} (Attempt ${attempt}/${maxRetries})`);
          if (attempt >= maxRetries) {
            throw new Error('Concurrent modification error. Please try again later.');
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
   * Rolls back a reservation by removing days from pendingDeductions.
   * 
   * @param {string} employeeId 
   * @param {string} locationId 
   * @param {LeaveType} leaveType 
   * @param {number} daysRequested 
   * @returns {Promise<LeaveBalance>}
   */
  async rollbackReservation(employeeId, locationId, leaveType, daysRequested) {
    const balanceRepo = this.dataSource.getRepository(LeaveBalance);
    const leaveBalance = await balanceRepo.findOne({
      where: { employeeId, locationId, leaveType }
    });

    if (!leaveBalance) {
      throw new Error('Leave balance not found during rollback');
    }

    leaveBalance.pendingDeductions = Number(leaveBalance.pendingDeductions) - daysRequested;

    return await balanceRepo.save(leaveBalance);
  }
}
