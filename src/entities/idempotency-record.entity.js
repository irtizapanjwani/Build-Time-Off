import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class IdempotencyRecord {
  /**
   * @type {string}
   */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key;

  /**
   * @type {string}
   */
  @Column({ type: 'varchar', length: 64 })
  employeeId;

  /**
   * @type {string}
   */
  @Column({ type: 'text' })
  responseBody;

  /**
   * @type {number}
   */
  @Column({ type: 'int' })
  statusCode;

  /**
   * @type {Date}
   */
  @CreateDateColumn()
  createdAt;
}
