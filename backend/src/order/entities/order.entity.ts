import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Table } from '../../table/entities/table.entity.js';

export enum OrderStatus {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

const priceTransformer = {
  to: (v: number) => v,
  from: (v: string) => parseFloat(v),
};

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Table, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'tableId' })
  @Column({ type: 'uuid' })
  tableId!: string;

  @Column({ type: 'varchar', default: OrderStatus.NEW })
  status!: OrderStatus;

  @Column({ type: 'jsonb' })
  items!: OrderItem[];

  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: priceTransformer })
  totalAmount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
