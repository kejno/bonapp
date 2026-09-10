import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum Role {
  OWNER = 'OWNER',
  STAFF = 'STAFF',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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
