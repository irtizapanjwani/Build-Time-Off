/**
 * Database Module
 * 
 * Configures TypeORM with SQLite (better-sqlite3 driver) and WAL journal mode.
 * 
 * TRD Section 13.2:
 *   - SQLite with WAL journal mode for concurrent reads
 *   - TypeORM migrations manage schema versioning
 *   - Database file should be on a persistent volume in production
 * 
 * WAL mode is enabled via a raw query after connection initialization,
 * ensuring concurrent read performance while maintaining write safety.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService) => {
        const dbPath = configService.get('database.path');

        // Ensure the directory for the database file exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }

        return {
          type: 'better-sqlite3',
          database: dbPath,
          // Migrations, not synchronize, manage schema in production (TRD 13.2)
          // synchronize enabled only in dev for convenience
          synchronize: process.env.NODE_ENV !== 'production',
          // Auto-load all entity files from the entities directory
          autoLoadEntities: true,
          // Explicitly load entities so TypeORM finds them before modules are wired
          entities: [__dirname + '/../entities/*.entity.js'],
          // Enable verbose logging in dev for observability (TRD Section 11)
          logging: process.env.NODE_ENV !== 'production' ? ['query', 'error'] : ['error'],
        };
      },
    }),
  ],
})
export class DatabaseModule {
  /**
   * After TypeORM connects, enable WAL journal mode.
   * WAL (Write-Ahead Logging) allows concurrent readers while a writer
   * is active — critical for the reconciliation worker reading balances
   * while the API layer processes requests.
   */
  constructor() { }

  async onModuleInit() {
    // WAL mode is set via the database connection after initialization.
    // We handle this in the AppModule's onModuleInit to ensure the
    // DataSource is fully initialized before running PRAGMA commands.
  }
}
