import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { HelpRequest } from '../help-requests/help-request.entity';
import { Volunteer } from '../volunteers/volunteer.entity';

export enum DispatchOfferStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

@Entity('dispatch_offers')
@Index(['requestId', 'volunteerId'], { unique: true })
export class DispatchOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'request_id' })
  requestId: string;

  @Column('uuid', { name: 'volunteer_id' })
  volunteerId: string;

  @ManyToOne(() => HelpRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: HelpRequest;

  @ManyToOne(() => Volunteer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volunteer_id' })
  volunteer: Volunteer;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DispatchOfferStatus,
    enumName: 'dispatch_offers_status_enum',
    default: DispatchOfferStatus.PENDING,
  })
  status: DispatchOfferStatus;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
}
