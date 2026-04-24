/**
 * AppModule — Root Module
 * 
 * Wires together:
 *   - ConfigModule (loads .env, registers all config namespaces)
 *   - DatabaseModule (TypeORM + SQLite + WAL mode)
 *   - ScheduleModule (cron jobs for reconciliation, retry, cleanup)
 * 
 * Also enables WAL journal mode on SQLite after the DataSource
 * is fully initialized (TRD Section 13.2).
 */
import { Module, Logger, Dependencies } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { DataSource } from 'typeorm';

import { DatabaseModule } from './database/database.module';
import {
  databaseConfig,
  hcmConfig,
  jobsConfig,
  idempotencyConfig,
  authConfig,
} from './config/app.config.js';

import { BalanceService } from './services/balance.service.js';
import { HcmClientService } from './services/hcm-client.service.js';
import { RequestService } from './services/request.service.js';
import { HcmRetryWorker } from './workers/hcm-retry.worker.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { TimeOffController } from './controllers/time-off.controller.js';
import { BalanceController } from './controllers/balance.controller.js';

@Module({
  imports: [
    // --- Configuration ---
    // Load .env file and register all config namespaces from TRD Section 13.1
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [databaseConfig, hcmConfig, jobsConfig, idempotencyConfig, authConfig],
    }),

    // --- Database ---
    DatabaseModule,

    // --- Scheduling ---
    // Required for reconciliation worker, retry worker, idempotency cleanup
    ScheduleModule.forRoot(),
    HttpModule,
  ],
  controllers: [
    TimeOffController,
    BalanceController,
  ],
  providers: [
    BalanceService,
    HcmClientService,
    RequestService,
    HcmRetryWorker,
    IdempotencyService,
  ],
})
@Dependencies(DataSource)
export class AppModule {
  static logger = new Logger('AppModule');

  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Enable WAL journal mode after TypeORM DataSource is initialized.
   * 
   * WAL mode allows concurrent readers while a single writer is active.
   * This is critical for the service because the reconciliation cron
   * and the API layer both need to read balances simultaneously.
   * 
   * Reference: TRD Section 13.2 — "SQLite with WAL journal mode for concurrent reads"
   */
  async onModuleInit() {
    try {
      await this.dataSource.query('PRAGMA journal_mode = WAL');
      const result = await this.dataSource.query('PRAGMA journal_mode');
      AppModule.logger.log(`SQLite journal mode: ${result[0]?.journal_mode || 'unknown'}`);

      // Also set busy_timeout to avoid SQLITE_BUSY under light contention
      await this.dataSource.query('PRAGMA busy_timeout = 5000');
      AppModule.logger.log('SQLite busy_timeout set to 5000ms');
    } catch (error) {
      AppModule.logger.error('Failed to configure SQLite PRAGMAs', error.stack);
    }
  }
}
