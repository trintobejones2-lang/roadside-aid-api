import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('fraud_history')
export class FraudHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'int', default: 0 })
  fraudFlagCount!: number;

  @Column({ type: 'text', nullable: true })
  fraudReason!: string | null;

  @Column({ type: 'varchar', length: 50 })
  action!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
