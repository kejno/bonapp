import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Tenant } from './tenant.entity.js';

export enum Role {
  OWNER = 'OWNER',
  STAFF = 'STAFF',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  @Column({ type: 'uuid' })
  tenantId!: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: 'varchar', default: Role.STAFF })
  role!: Role;
}
