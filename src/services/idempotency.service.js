import { Injectable, Dependencies } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdempotencyRecord } from '../entities/idempotency-record.entity.js';

@Injectable()
@Dependencies(DataSource)
export class IdempotencyService {
  /**
   * @param {DataSource} dataSource 
   */
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Retrieves a valid idempotency record (within 24 hours).
   * @param {string} key 
   * @returns {Promise<IdempotencyRecord | null>}
   */
  async getRecord(key) {
    const repo = this.dataSource.getRepository(IdempotencyRecord);
    const record = await repo.findOne({ where: { key } });

    if (!record) return null;

    // Check TTL (24 hours)
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    const isExpired = Date.now() - new Date(record.createdAt).getTime() > twentyFourHoursMs;

    if (isExpired) {
      // Clean up expired record lazily (optional)
      await repo.delete({ key });
      return null;
    }

    return record;
  }

  /**
   * Saves an idempotency record.
   * @param {string} key 
   * @param {string} employeeId 
   * @param {number} statusCode 
   * @param {any} responseBody 
   */
  async saveRecord(key, employeeId, statusCode, responseBody) {
    const repo = this.dataSource.getRepository(IdempotencyRecord);
    
    try {
      await repo.save({
        key,
        employeeId: employeeId || 'unknown',
        statusCode,
        responseBody: JSON.stringify(responseBody),
      });
    } catch (error) {
      // Log silently so we don't break main flow on idempotency failure
      console.error(`Failed to save idempotency record for key ${key}`, error);
    }
  }
}
