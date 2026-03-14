import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ClaimStatus {
  CLAIMED = 'CLAIMED',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('claims')
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  requestId: string;

  @Column({ type: 'uuid' })
  volunteerId: string;

  @Column({ type: 'enum', enum: ClaimStatus, default: ClaimStatus.CLAIMED })
  status: ClaimStatus;

  @Column({ type: 'int', nullable: true })
  etaMinutes: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  claimedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  arrivedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
