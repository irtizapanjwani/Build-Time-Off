import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * @typedef {import('../common/enums/leave-type.enum').LeaveType} LeaveType
 * @typedef {import('../common/enums/audit-source.enum').AuditSource} AuditSource
 */

@Entity()
export class BalanceAuditLog {
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
   * @type {number}
   */
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  delta;

  /**
   * @type {number}
   */
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  balanceBefore;

  /**
   * @type {number}
   */
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  balanceAfter;

  /**
   * @type {AuditSource}
   */
  @Column({ type: 'varchar' })
  source;

  /**
   * @type {string|null}
   */
  @Column({ type: 'varchar', nullable: true })
  referenceId;

  /**
   * @type {Date}
   */
  @CreateDateColumn()
  occurredAt;

  /**
   * @type {string}
   */
  @Column({ type: 'varchar' })
  actorId;
}
