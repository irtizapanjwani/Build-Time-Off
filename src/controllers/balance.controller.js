import { Controller, Get, Param, Dependencies, Bind } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LeaveBalance } from '../entities/leave-balance.entity.js';

@Controller('balances')
@Dependencies(DataSource)
export class BalanceController {
  /**
   * @param {DataSource} dataSource 
   */
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  @Get(':employeeId')
  @Bind(Param('employeeId'))
  async getBalance(employeeId) {
    const balanceRepo = this.dataSource.getRepository(LeaveBalance);
    return await balanceRepo.find({ where: { employeeId } });
  }
}
