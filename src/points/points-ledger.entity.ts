import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum PointsEventType {
  HELP_COMPLETED = 'HELP_COMPLETED',
  HELP_CONFIRMED = 'HELP_CONFIRMED',
}

@Entity('points_ledger')
@Index(['userId', 'eventType', 'requestId'], { unique: true })
@Index(['createdAt'])
@Index(['eventType'])
export class PointsLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: PointsEventType, enumName: 'points_event_type' })
  eventType: PointsEventType;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
