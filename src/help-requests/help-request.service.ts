import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Claim, ClaimStatus } from './claim.entity';
import { Confirmation } from './confirmation.entity';
import { CreateHelpRequestDto } from './dto/create-help-request.dto';
import { HelpRequest, HelpRequestStatus } from './help-request.entity';
import { PointsService } from '../points/points.service';
import { Volunteer } from '../volunteers/volunteer.entity';

//CONSTRUCTOR// Helper to build map bounds from items
@Injectable()
export class HelpRequestsService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(HelpRequest) private reqRepo: Repository<HelpRequest>,
    @InjectRepository(Claim) private claimRepo: Repository<Claim>,
    @InjectRepository(Volunteer) private volRepo: Repository<Volunteer>,
    @InjectRepository(Confirmation) private confRepo: Repository<Confirmation>,
    private points: PointsService,
  ) {}
  private isClaimStale(request: HelpRequest, staleMinutes = 15): boolean {
    if (!request.updatedAt) return false;

    const staleMs = staleMinutes * 60 * 1000;
    const ageMs = Date.now() - new Date(request.updatedAt).getTime();

    return ageMs >= staleMs;
  }
  async expireOldOpenRequests(expireMinutes = 30) {
    const openRequests = await this.reqRepo.find({
      where: { status: HelpRequestStatus.OPEN },
    });

    const now = Date.now();
    const expireMs = expireMinutes * 60 * 1000;

    for (const request of openRequests) {
      const createdAtMs = new Date(request.createdAt).getTime();

      if (now - createdAtMs >= expireMs) {
        request.status = HelpRequestStatus.EXPIRED;
        await this.reqRepo.save(request);
      }
    }
  }
  async reopenInactiveVolunteerClaims(timeoutMinutes = 5) {
    const claims = await this.claimRepo.find();

    const now = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    for (const claim of claims) {
      if (claim.status !== ClaimStatus.CLAIMED && claim.status !== ClaimStatus.EN_ROUTE) {
        continue;
      }

      const volunteer = await this.volRepo.findOne({
        where: { id: claim.volunteerId },
      });

      if (!volunteer?.updatedAt) continue;

      const lastUpdate = new Date(volunteer.updatedAt).getTime();

      if (now - lastUpdate > timeoutMs) {
        const request = await this.reqRepo.findOne({
          where: { id: claim.requestId },
        });

        if (!request) continue;

        if (
          request.status !== HelpRequestStatus.CLAIMED &&
          request.status !== HelpRequestStatus.EN_ROUTE
        ) {
          continue;
        }

        request.status = HelpRequestStatus.OPEN;
        await this.reqRepo.save(request);

        claim.status = ClaimStatus.CANCELLED;
        await this.claimRepo.save(claim);
      }
    }
  }
  async reopenStaleClaims() {
    const candidates = await this.reqRepo.find({
      where: [{ status: HelpRequestStatus.CLAIMED }, { status: HelpRequestStatus.EN_ROUTE }],
    });

    for (const request of candidates) {
      if (!this.isClaimStale(request, 15)) continue;

      request.status = HelpRequestStatus.OPEN;

      await this.reqRepo.save(request);
    }
  }

  async cancelRequest(requestId: string, requesterId: string) {
    return this.dataSource.transaction(async (m) => {
      const reqRepo = m.getRepository(HelpRequest);
      const claimRepo = m.getRepository(Claim);

      const request = await reqRepo.findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (request.requesterId !== requesterId) {
        throw new ForbiddenException('Not your request');
      }

      if (
        request.status !== HelpRequestStatus.OPEN &&
        request.status !== HelpRequestStatus.CLAIMED
      ) {
        throw new BadRequestException(`Cannot cancel request in status ${request.status}`);
      }

      request.status = HelpRequestStatus.CANCELLED;
      const savedRequest = await reqRepo.save(request);

      const claim = await claimRepo.findOne({
        where: { requestId },
        order: { claimedAt: 'DESC' },
      });

      if (claim) {
        claim.status = ClaimStatus.CANCELLED;
        await claimRepo.save(claim);
      }

      return {
        data: savedRequest,
      };
    });
  }
  // ----------------------------------------
  // Utility: Postgres Unique Violation Check
  // ----------------------------------------
  private isPgUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  // -----------------------------
  // Distance Helper (Miles)
  // -----------------------------
  private distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 3958.8; // Earth radius in miles

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ----------------------------------------
  // Get Full Request View
  // ----------------------------------------
  async getById(requestId: string) {
    const req = await this.reqRepo.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');

    const claim = await this.claimRepo.findOne({ where: { requestId } });
    const confirmation = await this.confRepo.findOne({ where: { requestId } });

    const volunteer = claim
      ? await this.volRepo.findOne({ where: { id: claim.volunteerId } })
      : null;

    return {
      request: {
        ...req,
        pickupLat: req.pickupLat != null ? Number(req.pickupLat) : null,
        pickupLng: req.pickupLng != null ? Number(req.pickupLng) : null,
        volunteerLat: volunteer?.lastLat != null ? Number(volunteer.lastLat) : null,
        volunteerLng: volunteer?.lastLng != null ? Number(volunteer.lastLng) : null,
      },
      claim: claim ?? null,
      confirmation: confirmation
        ? {
            confirmedByRequester: confirmation.confirmedByRequester,
            confirmedAt: confirmation.confirmedAt,
          }
        : null,
    };
  }

  // ----------------------------------------
  // OPEN (Paginated + Sortable, filtered by miles)
  // ----------------------------------------
  async listOpenForVolunteer(
    volunteerUserId: string,
    page = 1,
    limit = 20,
    sort: string = 'distance',
  ) {
    await this.reopenStaleClaims();
    await this.expireOldOpenRequests(30);
    await this.reopenInactiveVolunteerClaims(1);
    const v = await this.volRepo.findOne({ where: { userId: volunteerUserId } });
    if (!v) throw new ForbiddenException('Not a volunteer');
    if (!v.isAvailable) throw new ForbiddenException('Volunteer not available');
    if (!v.lastLat || !v.lastLng) throw new ForbiddenException('Volunteer location not set');

    const volLat = Number(v.lastLat);
    const volLng = Number(v.lastLng);

    // radius stored as km -> convert to miles
    const radiusMiles = (v.serviceRadiusKm ?? 10) * 0.621371;

    const rawSort = (sort ?? 'distance').toLowerCase();
    const safeSort =
      rawSort === 'distance' || rawSort === 'newest' || rawSort === 'oldest' ? rawSort : 'distance';

    const open = await this.reqRepo.find({
      where: { status: HelpRequestStatus.OPEN },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const filtered = open
      .map((r) => {
        const lat = Number(r.pickupLat);
        const lng = Number(r.pickupLng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const miles = this.distanceMiles(volLat, volLng, lat, lng);

        return {
          request: r,
          distanceMiles: Math.max(0.01, Number(miles.toFixed(2))),
        };
      })
      .filter(
        (x): x is { request: HelpRequest; distanceMiles: number } =>
          !!x && x.distanceMiles <= radiusMiles,
      )
      .sort((a, b) => {
        if (safeSort === 'newest') {
          return new Date(b.request.createdAt).getTime() - new Date(a.request.createdAt).getTime();
        }
        if (safeSort === 'oldest') {
          return new Date(a.request.createdAt).getTime() - new Date(b.request.createdAt).getTime();
        }
        return a.distanceMiles - b.distanceMiles;
      });

    const total = filtered.length;

    const take = Math.min(Math.max(limit, 1), 50);
    const start = (Math.max(page, 1) - 1) * take;
    const items = filtered.slice(start, start + take);

    return { items, total, sort: safeSort };
  }

  // ----------------------------------------
  // MINE (Paginated)
  // ----------------------------------------
  async listMine(requesterId: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await this.reqRepo.findAndCount({
      where: { requesterId },
      order: { createdAt: 'DESC' },
      skip,
      take,
    });

    return { items, total };
  }

  // ----------------------------------------
  // ASSIGNED (Paginated)
  // ----------------------------------------
  async listAssigned(volunteerUserId: string, page = 1, limit = 20) {
    const v = await this.volRepo.findOne({ where: { userId: volunteerUserId } });
    if (!v) throw new ForbiddenException('Not a volunteer');

    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;

    const total = await this.claimRepo.count({
      where: { volunteerId: v.id },
    });

    const claims = await this.claimRepo.find({
      where: { volunteerId: v.id },
      order: { claimedAt: 'DESC' },
      skip,
      take,
    });

    if (!claims.length) return { items: [], total };

    const requestIds = claims.map((c) => c.requestId);

    const requests = await this.reqRepo.find({
      where: { id: In(requestIds) },
    });

    const reqMap = new Map(requests.map((r) => [r.id, r]));

    const items = claims
      .map((c) => ({
        request: reqMap.get(c.requestId) ?? null,
        claim: c,
      }))
      .filter((x) => x.request !== null);

    return { items, total };
  }

  // ----------------------------------------
  // Create Help Request
  // ----------------------------------------
  async createRequest(requesterId: string, body: CreateHelpRequestDto) {
    const req = this.reqRepo.create({
      requesterId,
      type: body.type,
      status: HelpRequestStatus.OPEN,
      pickupLat: String(body.pickupLat),
      pickupLng: String(body.pickupLng),
      pickupAddress: body.pickupAddress ?? null,
      notes: body.notes ?? null,
    });

    return this.reqRepo.save(req);
  }

  // ----------------------------------------
  // Claim Request
  // ----------------------------------------
  async claimRequest(requestId: string, volunteerUserId: string, etaMinutes?: number) {
    return this.dataSource.transaction(async (m) => {
      const reqRepo = m.getRepository(HelpRequest);
      const claimRepo = m.getRepository(Claim);
      const volRepo = m.getRepository(Volunteer);

      const req = await reqRepo.findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!req) throw new NotFoundException('Request not found');
      if (req.status !== HelpRequestStatus.OPEN) throw new ConflictException('Not available');

      const v = await volRepo.findOne({ where: { userId: volunteerUserId } });
      if (!v) throw new ForbiddenException('Not a volunteer');
      if (!v.isAvailable) throw new ForbiddenException('Volunteer not available');
      if (req.requesterId === volunteerUserId) {
        throw new ForbiddenException('Cannot claim your own request');
      }

      const claim = claimRepo.create({
        requestId,
        volunteerId: v.id,
        status: ClaimStatus.CLAIMED,
        etaMinutes: etaMinutes ?? null,
      });

      try {
        await claimRepo.save(claim);
      } catch (e: unknown) {
        if (this.isPgUniqueViolation(e)) throw new ConflictException('Already claimed');
        throw e;
      }

      req.status = HelpRequestStatus.CLAIMED;
      await reqRepo.save(req);

      return { requestId, claimId: claim.id, status: req.status };
    });
  }

  // ----------------------------------------
  // Update Status (Safer Flow)
  // ----------------------------------------
  async updateStatus(id: string, status: HelpRequestStatus) {
    return this.dataSource.transaction(async (m) => {
      const reqRepo = m.getRepository(HelpRequest);
      const claimRepo = m.getRepository(Claim);

      const request = await reqRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException('Help request not found');
      }

      const allowedNext: Partial<Record<HelpRequestStatus, HelpRequestStatus[]>> = {
        OPEN: [HelpRequestStatus.CLAIMED, HelpRequestStatus.CANCELLED],

        CLAIMED: [HelpRequestStatus.EN_ROUTE, HelpRequestStatus.CANCELLED],

        EN_ROUTE: [HelpRequestStatus.ARRIVED, HelpRequestStatus.CANCELLED],

        ARRIVED: [HelpRequestStatus.IN_PROGRESS, HelpRequestStatus.CANCELLED],

        IN_PROGRESS: [HelpRequestStatus.COMPLETED, HelpRequestStatus.CANCELLED],

        COMPLETED: [],

        CANCELLED: [],

        EXPIRED: [],

        DISPUTED: [],
      };

      const validNextStatuses = allowedNext[request.status] ?? [];

      if (!validNextStatuses.includes(status)) {
        throw new BadRequestException(`Cannot change status from ${request.status} to ${status}`);
      }

      request.status = status;

      if (status === HelpRequestStatus.COMPLETED) {
        request.completedAt = new Date();
      }

      const savedRequest = await reqRepo.save(request);

      const claim = await claimRepo.findOne({
        where: { requestId: id },
        order: { claimedAt: 'DESC' },
      });

      if (claim) {
        switch (status) {
          case HelpRequestStatus.CLAIMED:
            claim.status = ClaimStatus.CLAIMED;
            break;

          case HelpRequestStatus.EN_ROUTE:
            claim.status = ClaimStatus.EN_ROUTE;
            break;

          case HelpRequestStatus.ARRIVED:
            claim.status = ClaimStatus.ARRIVED;
            break;

          case HelpRequestStatus.IN_PROGRESS:
            claim.status = ClaimStatus.IN_PROGRESS;
            break;

          case HelpRequestStatus.COMPLETED:
            claim.status = ClaimStatus.COMPLETED;
            break;

          case HelpRequestStatus.CANCELLED:
            claim.status = ClaimStatus.CANCELLED;
            break;
        }

        await claimRepo.save(claim);
      }

      return {
        data: savedRequest,
      };
    });
  }
  // ----------------------------------------
  // Confirm Completion (Requester)
  // ----------------------------------------
  async confirm(requestId: string, requesterId: string) {
    return this.dataSource.transaction(async (m) => {
      const reqRepo = m.getRepository(HelpRequest);
      const claimRepo = m.getRepository(Claim);
      const volRepo = m.getRepository(Volunteer);
      const confRepo = m.getRepository(Confirmation);

      const req = await reqRepo.findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!req) throw new NotFoundException('Request not found');
      if (req.requesterId !== requesterId) throw new ForbiddenException('Not your request');
      if (req.status !== HelpRequestStatus.COMPLETED) {
        throw new ConflictException('Not completed yet');
      }

      const claim = await claimRepo.findOne({
        where: { requestId, status: ClaimStatus.COMPLETED },
      });

      if (!claim) throw new ConflictException('No completed claim');

      const vol = await volRepo.findOne({ where: { id: claim.volunteerId } });
      if (!vol) throw new ConflictException('Volunteer missing');

      const existing = await confRepo.findOne({ where: { requestId } });

      if (!existing) {
        await confRepo.save(
          confRepo.create({
            requestId,
            confirmedByRequester: true,
            confirmedAt: new Date(),
          }),
        );
      } else if (!existing.confirmedByRequester) {
        existing.confirmedByRequester = true;
        existing.confirmedAt = new Date();
        await confRepo.save(existing);
      } else {
        return { requestId, confirmed: true };
      }

      await this.points.awardHelpConfirmed(m, vol.userId, requestId);

      return { requestId, confirmed: true };
    });
  }
}
