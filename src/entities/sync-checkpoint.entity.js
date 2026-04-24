import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class SyncCheckpoint {
  /**
   * @type {string}
   */
  @PrimaryGeneratedColumn('uuid')
  id;

  /**
   * @type {string}
   */
  @Column({ type: 'varchar', length: 64 })
  lastProcessedEmployeeId;

  /**
   * @type {number}
   */
  @Column({ type: 'int', default: 0 })
  offset;

  /**
   * @type {Date}
   */
  @CreateDateColumn()
  completedAt;
}
