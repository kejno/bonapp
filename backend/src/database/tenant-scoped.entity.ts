import { Column, PrimaryGeneratedColumn } from 'typeorm';

export abstract class TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;
}
