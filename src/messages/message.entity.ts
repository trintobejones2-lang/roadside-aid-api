import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  requestId!: string;

  @Index()
  @Column({ type: 'uuid' })
  senderUserId!: string;

  @Column({ type: 'text' })
  body!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
