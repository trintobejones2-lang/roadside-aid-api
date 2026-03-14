import { Entity, Column, CreateDateColumn, Index, PrimaryColumn } from 'typeorm';

@Entity('ranks')
export class Rank {
  @PrimaryColumn({ type: 'text' })
  rankKey: string;

  @Column({ type: 'text' })
  title: string;

  @Index({ unique: true })
  @Column({ type: 'int' })
  minPoints: number;

  @Index({ unique: true })
  @Column({ type: 'int' })
  sortOrder: number;

  @Column({ type: 'text', nullable: true })
  icon: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
