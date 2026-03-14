import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PointsLedger, PointsEventType } from './points-ledger.entity';
import { Rank } from './rank.entity';

@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(PointsLedger)
    private readonly ledgerRepo: Repository<PointsLedger>,

    @InjectRepository(Rank)
    private readonly rankRepo: Repository<Rank>,
  ) {}

  // -------------------------------------------------
  // Safe Postgres unique violation check
  // -------------------------------------------------
  private isPgUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  // -------------------------------------------------
  // Award base points when volunteer completes job
  // -------------------------------------------------
  async awardHelpCompleted(
    manager: EntityManager,
    userId: string,
    requestId: string,
  ): Promise<void> {
    const repo = manager.getRepository(PointsLedger);

    try {
      await repo.insert({
        userId,
        eventType: PointsEventType.HELP_COMPLETED,
        points: 10,
        requestId,
      });
    } catch (e: unknown) {
      if (this.isPgUniqueViolation(e)) return; // prevent double-award
      throw e;
    }
  }

  // -------------------------------------------------
  // Award bonus points when requester confirms job
  // -------------------------------------------------
  async awardHelpConfirmed(
    manager: EntityManager,
    userId: string,
    requestId: string,
  ): Promise<void> {
    const repo = manager.getRepository(PointsLedger);

    try {
      await repo.insert({
        userId,
        eventType: PointsEventType.HELP_CONFIRMED,
        points: 5,
        requestId,
      });
    } catch (e: unknown) {
      if (this.isPgUniqueViolation(e)) return;
      throw e;
    }
  }

  // -------------------------------------------------
  // Get total points for a user
  // -------------------------------------------------
  async getTotalPoints(userId: string): Promise<number> {
    const result = await this.ledgerRepo
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.points), 0)', 'total')
      .where('l.userId = :userId', { userId })
      .getRawOne<{ total: string }>();

    return Number(result?.total ?? 0);
  }

  // -------------------------------------------------
  // Get leaderboard (top N users)
  // -------------------------------------------------
  async getLeaderboard(limit = 10): Promise<Array<{ userId: string; points: number }>> {
    const rows = await this.ledgerRepo
      .createQueryBuilder('l')
      .select('l.userId', 'userId')
      .addSelect('COALESCE(SUM(l.points), 0)', 'points')
      .groupBy('l.userId')
      .orderBy('points', 'DESC')
      .limit(limit)
      .getRawMany<{ userId: string; points: string }>();

    return rows.map((r) => ({
      userId: r.userId,
      points: Number(r.points),
    }));
  }

  // -------------------------------------------------
  // Internal: find highest rank for given points
  // -------------------------------------------------
  private async getRankForPoints(points: number): Promise<Rank | null> {
    const rank = await this.rankRepo
      .createQueryBuilder('r')
      .where('r.minPoints <= :points', { points })
      .orderBy('r.minPoints', 'DESC')
      .getOne();

    return rank ?? null;
  }

  // -------------------------------------------------
  // Get rank + total points for a user
  // -------------------------------------------------
  async getRankForUser(userId: string): Promise<{ points: number; rank: Rank | null }> {
    const points = await this.getTotalPoints(userId);
    const rank = await this.getRankForPoints(points);

    return { points, rank };
  }

  // -------------------------------------------------
  // List all ranks (for UI display)
  // -------------------------------------------------
  async listRanks(): Promise<Rank[]> {
    return this.rankRepo.find({
      order: { sortOrder: 'ASC' },
    });
  }
}
