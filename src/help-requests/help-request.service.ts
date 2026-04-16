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
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DispatchQueue } from '../queue/dispatch.queue';
import { getDistanceInMeters } from '../utils/distance';
import { RequestUser } from '../common/types/request-user';

const ENABLE_REPEAT_REQUEST_WARNING = false;

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
    private realtime: RealtimeGateway,
    private dispatchQueue: DispatchQueue,
  ) {}
  private isClaimStale(request: HelpRequest, staleMinutes = 15): boolean {
    if (!request.updatedAt) return false;

    const staleMs = staleMinutes * 60 * 1000;
    const ageMs = Date.now() - new Date(request.updatedAt).getTime();

    return ageMs >= staleMs;
  }
  private async hasRecentCompletedOrConfirmedRequest(
    requesterId: string,
    withinMinutes = 30,
  ): Promise<boolean> {
    const since = new Date(Date.now() - withinMinutes * 60 * 1000);

    const recentRequest = await this.reqRepo
      .createQueryBuilder('r')
      .where('r.requesterId = :requesterId', { requesterId })
      .andWhere('r.createdAt >= :since', { since })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [HelpRequestStatus.COMPLETED],
      })
      .getOne();

    if (recentRequest) return true;

    const recentConfirmation = await this.confRepo
      .createQueryBuilder('c')
      .innerJoin(HelpRequest, 'r', 'r.id = c.requestId')
      .where('r.requesterId = :requesterId', { requesterId })
      .andWhere('c.confirmedAt >= :since', { since })
      .andWhere('c.confirmedByRequester = true')
      .getOne();

    return !!recentConfirmation;
  }
  async rateRequest(requestId: string, requesterId: string, rating: number, review?: string) {
    console.log('🔥 RATE REQUESTER HIT 🔥');
    const request = await this.reqRepo.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.requesterId !== requesterId) {
      throw new ForbiddenException('Not your request');
    }

    if (request.status !== HelpRequestStatus.COMPLETED) {
      throw new BadRequestException('You can only rate completed requests');
    }

    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    request.rating = rating;
    request.review = review?.trim() || null;

    const claim = await this.claimRepo.findOne({
      where: { requestId },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    const volunteer = await this.volRepo.findOne({
      where: { id: claim.volunteerId },
    });

    if (!volunteer) {
      throw new NotFoundException('Volunteer not found');
    }

    const currentCount = volunteer.ratingCount ?? 0;
    const currentAverage = Number(volunteer.averageRating ?? 0);

    const newCount = currentCount + 1;
    const newAverage = (currentAverage * currentCount + rating) / newCount;

    volunteer.ratingCount = newCount;
    volunteer.averageRating = Number(newAverage.toFixed(2));

    await this.volRepo.save(volunteer);

    const saved = await this.reqRepo.save(request);

    return {
      data: saved,
    };
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

      this.realtime.broadcastStatusUpdated({
        requestId: savedRequest.id,
        status: savedRequest.status,
      });

      await this.dispatchQueue.addStatusUpdateJob({
        requestId: savedRequest.id,
        status: savedRequest.status,
      });

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
  //increments fraud_flag_count for the volunteer and sets anti_cheat_flag and reason on the request
  private async appendAntiCheatReason(request: HelpRequest, reason: string) {
    request.anti_cheat_flag = true;

    let isNewReason = false;

    if (!request.anti_cheat_reason) {
      request.anti_cheat_reason = reason;
      isNewReason = true;
    } else if (!request.anti_cheat_reason.includes(reason)) {
      request.anti_cheat_reason = `${request.anti_cheat_reason} | ${reason}`;
      isNewReason = true;
    }

    // ✅ Only increment once per new reason
    if (isNewReason) {
      const claim = await this.claimRepo.findOne({
        where: { requestId: request.id },
      });

      if (claim) {
        const volunteer = await this.volRepo.findOne({
          where: { id: claim.volunteerId },
        });

        if (volunteer) {
          volunteer.fraud_flag_count = (volunteer.fraud_flag_count ?? 0) + 1;
          await this.volRepo.save(volunteer);
        }
      }
    }
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
    type RequesterProfileRow =
      | {
          selfie_path: string | null;
          full_name: string | null;
        }
      | null
      | undefined;

    const profile: RequesterProfileRow = await this.dataSource
      .createQueryBuilder()
      .select(['p.selfie_path AS selfie_path', 'p.full_name AS full_name'])
      .from('profiles', 'p')
      .where('p.id = :id', { id: req.requesterId })
      .getRawOne();
    type VolunteerProfileRow =
      | {
          selfie_path: string | null;
          full_name: string | null;
        }
      | null
      | undefined;
    const volunteerProfile: VolunteerProfileRow = volunteer
      ? await this.dataSource
          .createQueryBuilder()
          .select(['p.selfie_path AS selfie_path', 'p.full_name AS full_name'])
          .from('profiles', 'p')
          .where('p.id = :id', { id: volunteer.userId })
          .getRawOne()
      : null;
    return {
      request: {
        ...req,
        requesterSelfiePath: profile?.selfie_path ?? null,
        requesterName: profile?.full_name ?? null,
        volunteerSelfiePath: volunteerProfile?.selfie_path ?? null,
        volunteerName: volunteerProfile?.full_name ?? null,
        volunteerAverageRating: volunteer?.averageRating ?? 0,
        volunteerRatingCount: volunteer?.ratingCount ?? 0,
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
    const pagedItems = filtered.slice(start, start + take);
    type RequesterNameRow =
      | {
          full_name: string | null;
        }
      | null
      | undefined;
    const items = await Promise.all(
      pagedItems.map(async (item) => {
        const profile: RequesterNameRow = await this.dataSource
          .createQueryBuilder()
          .select(['p.full_name AS full_name'])
          .from('profiles', 'p')
          .where('p.id = :id', { id: item.request.requesterId })
          .getRawOne();

        return {
          ...item,
          request: {
            ...item.request,
            requesterName: profile?.full_name ?? null,
          },
        };
      }),
    );

    return { items, total, sort: safeSort };
  }
  async rateRequester(requestId: string, volunteerId: string, rating: number, review?: string) {
    const request = await this.reqRepo.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== HelpRequestStatus.COMPLETED) {
      throw new BadRequestException('Requester can only be rated after completion');
    }

    if (!request.requesterId) {
      throw new BadRequestException('Requester not found on this request');
    }

    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }
    if (request.requesterRating !== null) {
      throw new BadRequestException('Requester already rated');
    }
    const volunteer = await this.volRepo.findOne({
      where: { userId: volunteerId },
    });

    if (!volunteer) {
      throw new NotFoundException('Volunteer not found');
    }
    console.log('RATE REQUESTER requestId =', requestId);
    console.log('RATE REQUESTER incoming userId =', volunteerId);
    console.log('RATE REQUESTER volunteer.id =', volunteer.id);
    const claim = await this.claimRepo.findOne({
      where: {
        requestId,
        volunteerId: volunteer.id,
        status: ClaimStatus.COMPLETED,
      },
    });

    if (!claim) {
      throw new ForbiddenException('Only the assigned volunteer can rate this requester');
    }
    console.log('RATE REQUESTER claim.volunteerId =', claim.volunteerId);
    console.log('RATE REQUESTER volunteer.id =', volunteer.id);
    // (claim.volunteerId !== volunteer.id) {
    //Throw new ForbiddenException('Only the assigned volunteer can rate this requester');
    //

    request.requesterRating = rating;
    request.requesterReview = review?.trim() || null;

    await this.reqRepo.save(request);

    return {
      success: true,
      requestId,
      requesterId: request.requesterId,
      rating,
      review: request.requesterReview,
    };
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
    type HistoryRequesterRow =
      | {
          full_name: string | null;
          average_rating: number | null;
          rating_count: number | null;
        }
      | null
      | undefined;
    const items = await Promise.all(
      claims.map(async (c) => {
        const req = reqMap.get(c.requestId);
        if (!req) return null;

        const profile: HistoryRequesterRow = await this.dataSource
          .createQueryBuilder()
          .select([
            'p.full_name AS full_name',
            'v."averageRating" AS average_rating',
            'v."ratingCount" AS rating_count',
          ])
          .from('profiles', 'p')
          .leftJoin('volunteers', 'v', 'v."userId" = p.id')
          .where('p.id = :id', { id: req.requesterId })
          .getRawOne();

        return {
          request: {
            ...req,
            requesterName: profile?.full_name ?? null,
            requesterAverageRating: profile?.average_rating ?? 0,
            requesterRatingCount: profile?.rating_count ?? 0,
          },
          claim: c,
        };
      }),
    );

    return {
      items: items.filter((x) => x !== null),
      total,
    };
  }
  async listFlaggedRequests() {
    const requests = await this.reqRepo.find({
      where: { anti_cheat_flag: true },
      order: { updatedAt: 'DESC' },
    });

    const results = await Promise.all(
      requests.map(async (request) => {
        const claim = await this.claimRepo.findOne({
          where: { requestId: request.id },
        });

        if (!claim) {
          return {
            ...request,
            volunteer: null,
          };
        }

        const volunteer = await this.volRepo.findOne({
          where: { id: claim.volunteerId },
        });

        return {
          ...request,
          volunteer: volunteer
            ? {
                id: volunteer.id,
                userId: volunteer.userId,
                fraud_flag_count: volunteer.fraud_flag_count,
              }
            : null,
        };
      }),
    );

    return results;
  }
  async clearFraudFlag(id: string) {
    return this.reqRepo.update(id, {
      anti_cheat_flag: false,
    });
  }
  // Admin marks request as confirmed fraud, which cancels the request and increments fraud flag on volunteer
  async confirmFraud(id: string) {
    return this.reqRepo.update(id, {
      status: HelpRequestStatus.CANCELLED,
      anti_cheat_flag: true,
    });
  }
  // ----------------------------------------
  // Create Help Request
  // ----------------------------------------
  async createRequest(user: RequestUser, body: CreateHelpRequestDto) {
    if (user.isBlocked) {
      throw new ForbiddenException('Your account is permanently blocked. Please contact support.');
    }
    if ((user.fraudFlagCount ?? 0) >= 3) {
      throw new ForbiddenException(
        'Your account is temporarily restricted. Please contact support.',
      );
    }
    const req = this.reqRepo.create({
      requesterId: user.userId,
      type: body.type,
      status: HelpRequestStatus.OPEN,
      pickupLat: String(body.pickupLat),
      pickupLng: String(body.pickupLng),
      pickupAddress: body.pickupAddress ?? null,
      notes: body.notes ?? null,
      fuelType: body.fuelType ?? null,
    });

    const saved = await this.reqRepo.save(req);

    this.realtime.broadcastNewRequest(saved);
    await this.dispatchQueue.addNewRequestJob({
      requestId: saved.id,
      type: saved.type,
      requesterId: saved.requesterId,
    });

    return saved;
  }

  // ----------------------------------------
  // Claim Request
  // ----------------------------------------
  async claimRequest(
    requestId: string,
    volunteerUserId: string,
    lat: number,
    lng: number,
    etaMinutes?: number,
  ) {
    if (ENABLE_REPEAT_REQUEST_WARNING) {
      const request = await this.reqRepo.findOne({
        where: { id: requestId },
      });

      if (request) {
        const hasRecentRequest = await this.hasRecentCompletedOrConfirmedRequest(
          request.requesterId,
          30,
        );

        if (hasRecentRequest) {
          throw new BadRequestException(
            'This requester recently completed a job. Try again later.',
          );
        }
      }
    }
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
      if ((v.fraud_flag_count ?? 0) >= 3) {
        throw new ForbiddenException(
          'Your volunteer account is temporarily restricted. Please contact support.',
        );
      }
      if ((v.fraud_flag_count ?? 0) >= 3) {
        throw new ForbiddenException(
          'Your volunteer account is temporarily restricted. Please contact support.',
        );
      }
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

      req.volunteer_accept_lat = lat;
      req.volunteer_accept_lng = lng;
      req.volunteer_accept_at = new Date();

      await reqRepo.save(req);

      // automatically set volunteer offline after accepting a job
      v.isAvailable = false;
      await volRepo.save(v);

      this.realtime.broadcastClaim({
        requestId,
        claimId: claim.id,
        status: req.status,
      });

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

        const claim = await claimRepo.findOne({
          where: { requestId: id },
        });
        console.log('ALL CLAIMS FOR REQUEST:', claim);
        if (claim) {
          const volunteer = await this.volRepo.findOne({
            where: { id: claim.volunteerId },
          });

          if (volunteer) {
            volunteer.isAvailable = true;
            await this.volRepo.save(volunteer);

            console.log(
              'updateStatus set volunteer back online:',
              volunteer.id,
              volunteer.userId,
              volunteer.isAvailable,
            );
          }
        }
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

  async markArrived(id: string, volunteerUserId: string, lat: number, lng: number) {
    console.log('RATE REQUESTER volunteerId (userId) =', volunteerUserId);
    const volunteer = await this.volRepo.findOne({
      where: { userId: volunteerUserId },
    });

    if (!volunteer) {
      throw new ForbiddenException('Not a volunteer');
    }
    if (!volunteer.updatedAt) {
      throw new ForbiddenException('Location not available');
    }

    const locationAgeMs = Date.now() - new Date(volunteer.updatedAt).getTime();
    const MAX_LOCATION_AGE_MS = 2 * 60 * 1000; // 2 minutes

    if (locationAgeMs > MAX_LOCATION_AGE_MS) {
      throw new ForbiddenException('Location is too old. Please refresh your location.');
    }
    const request = await this.reqRepo.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const claim = await this.claimRepo.findOne({
      where: { requestId: id, volunteerId: volunteer.id },
    });

    if (!claim) {
      throw new ForbiddenException('You are not assigned to this request');
    }

    const pickupLat = Number(request.pickupLat);
    const pickupLng = Number(request.pickupLng);

    const distance = getDistanceInMeters(lat, lng, pickupLat, pickupLng);

    const MAX_DISTANCE_METERS = 1000;
    const FLAG_DISTANCE_METERS = 900;

    if (distance > MAX_DISTANCE_METERS) {
      throw new BadRequestException(`Too far from location (${Math.round(distance)}m away)`);
    }

    if (distance > FLAG_DISTANCE_METERS) {
      await this.appendAntiCheatReason(
        request,
        `Arrived from suspicious distance: ${Math.round(distance)}m`,
      );
    }
    // Check for suspiciously fast arrival after accept (possible GPS spoofing or cheating)
    const arrivedAt = new Date();

    if (
      request.volunteer_accept_at &&
      request.volunteer_accept_lat != null &&
      request.volunteer_accept_lng != null
    ) {
      const acceptAtMs = new Date(request.volunteer_accept_at).getTime();
      const arrivedAtMs = arrivedAt.getTime();
      const secondsBetween = Math.round((arrivedAtMs - acceptAtMs) / 1000);

      if (secondsBetween < 30) {
        await this.appendAntiCheatReason(
          request,
          `Arrived suspiciously fast after accept: ${secondsBetween}s`,
        );
      }

      const acceptToArriveDistance = getDistanceInMeters(
        Number(request.volunteer_accept_lat),
        Number(request.volunteer_accept_lng),
        lat,
        lng,
      );

      if (secondsBetween > 0) {
        const metersPerSecond = acceptToArriveDistance / secondsBetween;

        if (metersPerSecond > 45) {
          await this.appendAntiCheatReason(
            request,
            `Movement suspiciously fast from accept to arrive: ${Math.round(acceptToArriveDistance)}m in ${secondsBetween}s`,
          );
        }
      }
    }

    request.volunteer_arrived_lat = lat;
    request.volunteer_arrived_lng = lng;
    request.volunteer_arrived_at = arrivedAt;

    await this.reqRepo.save(request);

    return this.updateStatus(id, HelpRequestStatus.ARRIVED);
  }

  async markCompleted(id: string, volunteerUserId: string, lat: number, lng: number) {
    const volunteer = await this.volRepo.findOne({
      where: { userId: volunteerUserId },
    });

    if (!volunteer) {
      throw new ForbiddenException('Not a volunteer');
    }
    if (!volunteer.updatedAt) {
      throw new ForbiddenException('Location not available');
    }

    const locationAgeMs = Date.now() - new Date(volunteer.updatedAt).getTime();
    const MAX_LOCATION_AGE_MS = 2 * 60 * 1000; // 2 minutes

    if (locationAgeMs > MAX_LOCATION_AGE_MS) {
      throw new ForbiddenException('Location is too old. Please refresh your location.');
    }
    const request = await this.reqRepo.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const claim = await this.claimRepo.findOne({
      where: { requestId: id, volunteerId: volunteer.id },
    });

    if (!claim) {
      throw new ForbiddenException('You are not assigned to this request');
    }

    const pickupLat = Number(request.pickupLat);
    const pickupLng = Number(request.pickupLng);

    const distance = getDistanceInMeters(lat, lng, pickupLat, pickupLng);

    const MAX_DISTANCE_METERS = 1000;
    const FLAG_DISTANCE_METERS = 900;

    if (distance > MAX_DISTANCE_METERS) {
      throw new BadRequestException(`Too far from location (${Math.round(distance)}m away)`);
    }

    if (distance > FLAG_DISTANCE_METERS) {
      await this.appendAntiCheatReason(
        request,
        `Completed from suspicious distance: ${Math.round(distance)}m`,
      );
    }
    // Check for suspiciously fast completion after arrival (possible GPS spoofing or cheating)
    const completedAt = new Date();

    if (
      request.volunteer_arrived_at &&
      request.volunteer_arrived_lat != null &&
      request.volunteer_arrived_lng != null
    ) {
      const arrivedAtMs = new Date(request.volunteer_arrived_at).getTime();
      const completedAtMs = completedAt.getTime();
      const secondsBetween = Math.round((completedAtMs - arrivedAtMs) / 1000);

      if (secondsBetween < 60) {
        await this.appendAntiCheatReason(
          request,
          `Completed suspiciously fast after arrival: ${secondsBetween}s`,
        );
      }

      const arriveToCompleteDistance = getDistanceInMeters(
        Number(request.volunteer_arrived_lat),
        Number(request.volunteer_arrived_lng),
        lat,
        lng,
      );

      if (secondsBetween > 0) {
        const metersPerSecond = arriveToCompleteDistance / secondsBetween;

        if (metersPerSecond > 45) {
          await this.appendAntiCheatReason(
            request,
            `Movement suspiciously fast from arrive to complete: ${Math.round(arriveToCompleteDistance)}m in ${secondsBetween}s`,
          );
        }
      }
    }

    request.volunteer_completed_lat = lat;
    request.volunteer_completed_lng = lng;
    request.volunteer_completed_at = completedAt;

    await this.reqRepo.save(request);

    return this.updateStatus(id, HelpRequestStatus.COMPLETED);
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

      return { requestId, confirmed: true, pointsAwarded: 5 };
    });
  }
}
