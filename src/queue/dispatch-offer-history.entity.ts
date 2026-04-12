import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum DispatchOfferHistoryAction {
  CREATED = 'CREATED',
  SENT_TO_VOLUNTEER = 'SENT_TO_VOLUNTEER',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  REDISPATCHED = 'REDISPATCHED',
}

@Entity('dispatch_offer_history')
export class DispatchOfferHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'offer_id', type: 'uuid' })
  offerId!: string;

  @Index()
  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Index()
  @Column({ name: 'volunteer_id', type: 'uuid' })
  volunteerId!: string;

  @Column({
    type: 'enum',
    enum: DispatchOfferHistoryAction,
    enumName: 'dispatch_offer_history_action',
  })
  action!: DispatchOfferHistoryAction;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
