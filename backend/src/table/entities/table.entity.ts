import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Tenant } from '../../identity/entities/tenant.entity.js';

@Entity('tables')
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true, type: 'varchar' })
  description!: string | null;
}
