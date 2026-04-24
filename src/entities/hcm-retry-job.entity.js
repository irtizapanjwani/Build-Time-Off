import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * @typedef {import('../common/enums/retry-status.enum').RetryStatus} RetryStatus
 */

@Entity()
export class HcmRetryJob {
  /**
   * @type {string}
   */
  @PrimaryGeneratedColumn('uuid')
  id;

  /**
   * @type {string}
   */
  @Column({ type: 'varchar', length: 64 })
  requestId;

  /**
   * @type {string}
   */
  @Column({ type: 'text' })
  payload;

  /**
   * @type {RetryStatus}
   */
  @Column({ type: 'varchar' })
  status;

  /**
   * @type {number}
   */
  @Column({ type: 'int', default: 0 })
  attempts;

  /**
   * @type {Date|null}
   */
  @Column({ type: 'datetime', nullable: true })
  lastAttemptAt;

  /**
   * @type {Date}
   */
  @CreateDateColumn()
  createdAt;

  /**
   * @type {Date}
   */
  @UpdateDateColumn()
  updatedAt;
}
