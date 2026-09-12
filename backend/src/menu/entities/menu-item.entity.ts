import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { priceTransformer } from '../../database/price-transformer.js';
import { TenantScopedEntity } from '../../database/tenant-scoped.entity.js';
import { MenuCategory } from './menu-category.entity.js';

@Entity('menu_items')
export class MenuItem extends TenantScopedEntity {
  @ManyToOne(() => MenuCategory, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  @Column({ type: 'uuid' })
  categoryId!: string;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: priceTransformer })
  price!: number;

  @Column({ type: 'boolean', default: true })
  isAvailable!: boolean;

  @Column({ type: 'varchar', nullable: true })
  imageUrl!: string | null;
}
