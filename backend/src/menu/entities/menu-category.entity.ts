import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '../../database/tenant-scoped.entity.js';

@Entity('menu_categories')
export class MenuCategory extends TenantScopedEntity {
  @Column()
  name!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isVisible!: boolean;
}
