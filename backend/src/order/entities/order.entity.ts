import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { priceTransformer } from '../../database/price-transformer.js';
import { TenantScopedEntity } from '../../database/tenant-scoped.entity.js';
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

@Entity('orders')
export class Order extends TenantScopedEntity {
  @ManyToOne(() => Table, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'tableId' })
  @Column({ type: 'uuid' })
  tableId!: string;

  @Column({ type: 'varchar' })
  tableName!: string;

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
