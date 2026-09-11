import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Table } from '../../table/entities/table.entity.js';

export enum OrderStatus {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Table, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'tableId' })
  @Column({ type: 'uuid' })
  tableId!: string;

  @Column({ type: 'varchar', default: OrderStatus.NEW })
  status!: OrderStatus;
}
