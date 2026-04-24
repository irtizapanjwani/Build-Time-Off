import { Entity, PrimaryGeneratedColumn, Column, VersionColumn, Unique } from 'typeorm';

/**
 * @typedef {import('../common/enums/leave-type.enum').LeaveType} LeaveType
 */

@Entity()
@Unique(['employeeId', 'locationId', 'leaveType'])
export class LeaveBalance {
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
  balance;

  /**
   * @type {Date|null}
   */
  @Column({ type: 'datetime', nullable: true })
  hcmSyncedAt;

  /**
   * @type {number}
   */
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  pendingDeductions;

  /**
   * @type {number}
   */
  @VersionColumn()
  version;
}
