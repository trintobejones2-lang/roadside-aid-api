import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

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

  @Column({ type: 'uuid' })
  offerId!: string;

  @Column({ type: 'uuid' })
  requestId!: string;

  @Column({ type: 'uuid' })
  volunteerId!: string;

  @Column({
    type: 'enum',
    enum: DispatchOfferHistoryAction,
  })
  action!: DispatchOfferHistoryAction;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
