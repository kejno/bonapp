import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column({ type: 'uuid' })
  tableId!: string;

  @Column({ type: 'varchar', default: OrderStatus.NEW })
  status!: OrderStatus;
}
