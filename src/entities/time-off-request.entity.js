import { Entity, PrimaryGeneratedColumn, Column, VersionColumn, CreateDateColumn } from 'typeorm';

/**
 * @typedef {import('../common/enums/leave-type.enum').LeaveType} LeaveType
 * @typedef {import('../common/enums/request-status.enum').RequestStatus} RequestStatus
 */

@Entity()
export class TimeOffRequest {
  /**
   * @type {string}
   */
  @PrimaryGeneratedColumn('uuid')
  id;

  /**
   * @type {string}
   */
  @Column({ type: 'varchar', length: 64 })
  employeeId;

  /**
   * @type {string}
   */
  @Column({ type: 'varchar', length: 64 })
  locationId;

  /**
   * @type {LeaveType}
   */
  @Column({ type: 'varchar' })
  leaveType;

  /**
   * @type {string}
   */
  @Column({ type: 'text' })
  startDate;

  /**
   * @type {string}
   */
  @Column({ type: 'text' })
  endDate;

  /**
   * @type {number}
   */
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  daysRequested;

  /**
   * @type {RequestStatus}
   */
  @Column({ type: 'varchar' })
  status;

  /**
   * @type {string|null}
   */
  @Column({ type: 'varchar', nullable: true })
  hcmTransactionId;

  /**
   * @type {Date}
   */
  @CreateDateColumn()
  requestedAt;

  /**
   * @type {Date|null}
   */
  @Column({ type: 'datetime', nullable: true })
  resolvedAt;

  /**
   * @type {string|null}
   */
  @Column({ type: 'varchar', nullable: true })
  resolvedBy;

  /**
   * @type {string|null}
   */
  @Column({ type: 'text', nullable: true })
  notes;

  /**
   * @type {number}
   */
  @VersionColumn()
  version;
}
