import { Test } from '@nestjs/testing';
import { DataSource, OptimisticLockVersionMismatchError } from 'typeorm';
import { BalanceService } from './balance.service.js';
import { LeaveBalance } from '../entities/leave-balance.entity.js';

describe('BalanceService', () => {
  let service;
  let dataSource;
  let queryRunner;

  beforeEach(async () => {
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        update: jest.fn(),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const module = await Test.createTestingModule({
      providers: [
        BalanceService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(BalanceService);
  });

  describe('reserveBalance', () => {
    it('should successfully reserve balance when version matches', async () => {
      const mockBalance = { id: 'uuid-1', balance: 20, pendingDeductions: 0, version: 1 };
      queryRunner.manager.findOne.mockResolvedValue(mockBalance);
      queryRunner.manager.update.mockResolvedValue({ affected: 1 });

      const result = await service.reserveBalance('emp-1', 'loc-1', 'ANNUAL', 5);

      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        LeaveBalance,
        { id: 'uuid-1', version: 1 },
        { pendingDeductions: 5 }
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should retry up to 3 times and then throw on persistent version mismatch', async () => {
      const mockBalance = { id: 'uuid-1', balance: 20, pendingDeductions: 0, version: 1 };
      queryRunner.manager.findOne.mockResolvedValue(mockBalance);
      
      // Always fail the update
      queryRunner.manager.update.mockResolvedValue({ affected: 0 });

      await expect(service.reserveBalance('emp-1', 'loc-1', 'ANNUAL', 5))
        .rejects.toThrow('Concurrent modification error during reserving balance for emp-1');

      expect(queryRunner.manager.update).toHaveBeenCalledTimes(3);
      expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(3);
    });

    it('should throw if balance is insufficient', async () => {
      const mockBalance = { id: 'uuid-1', balance: 2, pendingDeductions: 0, version: 1 };
      queryRunner.manager.findOne.mockResolvedValue(mockBalance);

      await expect(service.reserveBalance('emp-1', 'loc-1', 'ANNUAL', 5))
        .rejects.toThrow('Insufficient available balance');

      expect(queryRunner.manager.update).not.toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('commitReservation', () => {
    it('should successfully commit and reduce actual balance', async () => {
      const mockBalance = { id: 'uuid-1', balance: 20, pendingDeductions: 5, version: 2 };
      queryRunner.manager.findOne.mockResolvedValue(mockBalance);
      queryRunner.manager.update.mockResolvedValue({ affected: 1 });

      await service.commitReservation('emp-1', 'loc-1', 'ANNUAL', 5);

      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        LeaveBalance,
        { id: 'uuid-1', version: 2 },
        { balance: 15, pendingDeductions: 0 }
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });
  });
});
