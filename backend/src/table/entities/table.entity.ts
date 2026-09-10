import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tables')
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true, type: 'varchar' })
  description!: string | null;
}
