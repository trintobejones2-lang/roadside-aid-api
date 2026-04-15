import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Volunteer } from '../volunteers/volunteer.entity';
import { DispatchOffer, DispatchOfferStatus } from './dispatch-offer.entity';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { HelpRequest, HelpRequestStatus } from '../help-requests/help-request.entity';
import { Claim, ClaimStatus } from '../help-requests/claim.entity';
import { DispatchOfferHistory, DispatchOfferHistoryAction } from './dispatch-offer-history.entity';
type PendingOfferRow = {
  id: string;
  status: string;
  createdat: string;

  request_id: string | null;
  requesterid: string | null;
  requestername: string | null;
  requesterselfiepath: string | null;
  type: string | null;
  fueltype: string | null;
  request_status: string | null;
  request_createdat: string | null;
  pickuplat: string | null;
  pickuplng: string | null;
  pickupaddress: string | null;
  notes: string | null;
};
@Injectable()
export class DispatchService {
  constructor(
    @InjectRepository(Volunteer)
    private readonly volunteerRepo: Repository<Volunteer>,

    @InjectRepository(DispatchOffer)
    private readonly dispatchOfferRepo: Repository<DispatchOffer>,
    @InjectRepository(DispatchOfferHistory)
    private readonly dispatchOfferHistoryRepo: Repository<DispatchOfferHistory>,

    @InjectRepository(HelpRequest)
    private readonly helpRequestRepo: Repository<HelpRequest>,
    @InjectRepository(Claim)
    private readonly claimRepo: Repository<Claim>,
  ) {}
  async acceptOffer(offerId: string, volunteerUserId: string, lat: number, lng: number) {
    return this.dispatchOfferRepo.manager.transaction(async (manager) => {
      const offerRepo = manager.getRepository(DispatchOffer);
      const requestRepo = manager.getRepository(HelpRequest);
      const volunteerRepo = manager.getRepository(Volunteer);
      const claimRepo = manager.getRepository(Claim);
      // 1) Lock the offer row ONLY (no relations here)
      const offer = await offerRepo.findOne({
        where: { id: offerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!offer) {
        throw new NotFoundException('Offer not found');
      }

      // 2) Load volunteer separately
      const volunteer = await volunteerRepo.findOne({
        where: { id: offer.volunteerId },
      });

      if (!volunteer) {
        throw new NotFoundException('Volunteer not found for offer');
      }

      if (volunteer.userId !== volunteerUserId) {
        throw new ForbiddenException('This offer does not belong to you');
      }

      if (offer.status !== DispatchOfferStatus.PENDING) {
        throw new ConflictException('Offer is no longer available');
      }

      if (offer.expiresAt && new Date(offer.expiresAt).getTime() <= Date.now()) {
        offer.status = DispatchOfferStatus.EXPIRED;
        await offerRepo.save(offer);
        throw new ConflictException('Offer expired');
      }

      // 3) Lock the request row separately
      const request = await requestRepo.findOne({
        where: { id: offer.requestId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (request.status !== HelpRequestStatus.OPEN) {
        throw new ConflictException('Request is no longer available');
      }
      // 🚫 ANTI-CHEAT — stale location check
      if (!volunteer.updatedAt) {
        throw new ForbiddenException('Location not available');
      }

      const locationAgeMs = Date.now() - new Date(volunteer.updatedAt).getTime();
      const MAX_LOCATION_AGE_MS = 2 * 60 * 1000; // 2 minutes

      if (locationAgeMs > MAX_LOCATION_AGE_MS) {
        throw new ForbiddenException('Location is too old. Please refresh your location.');
      }
      // ✅ Prevent volunteer from accepting their own request
      if (request.requesterId === volunteerUserId) {
        throw new ForbiddenException('You cannot accept your own request');
      }
      // ✅ ANTI-CHEAT #3 — Location check (volunteer must be within 50 miles)
      if (
        volunteer.lastLat != null &&
        volunteer.lastLng != null &&
        request.pickupLat != null &&
        request.pickupLng != null
      ) {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const R = 3958.8;

        const lat1 = Number(volunteer.lastLat);
        const lng1 = Number(volunteer.lastLng);
        const lat2 = Number(request.pickupLat);
        const lng2 = Number(request.pickupLng);

        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);

        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

        const distanceMiles = 2 * R * Math.asin(Math.sqrt(a));

        if (distanceMiles > 50) {
          throw new ForbiddenException(
            `You are too far away to accept this request (${distanceMiles.toFixed(1)} miles)`,
          );
        }

        if (distanceMiles > 25) {
          request.anti_cheat_flag = true;

          const reason = `Accepted from suspicious distance: ${distanceMiles.toFixed(1)} miles`;

          if (!request.anti_cheat_reason) {
            request.anti_cheat_reason = reason;
          } else if (!request.anti_cheat_reason.includes(reason)) {
            request.anti_cheat_reason = `${request.anti_cheat_reason} | ${reason}`;
          }
        }
      }
      // 4) Accept this offer
      offer.status = DispatchOfferStatus.ACCEPTED;
      await offerRepo.save(offer);
      await manager.getRepository(DispatchOfferHistory).save({
        offerId: offer.id,
        requestId: offer.requestId,
        volunteerId: offer.volunteerId,
        action: DispatchOfferHistoryAction.ACCEPTED,
        notes: null,
      });
      // 5) Claim the request
      request.status = HelpRequestStatus.CLAIMED;
      request.volunteer_accept_lat = lat;
      request.volunteer_accept_lng = lng;
      request.volunteer_accept_at = new Date();

      await requestRepo.save(request);

      volunteer.isAvailable = false;
      await volunteerRepo.save(volunteer);

      console.log(
        'acceptOffer set volunteer offline:',
        volunteer.id,
        volunteer.userId,
        volunteer.isAvailable,
      );

      const claim = claimRepo.create({
        requestId: request.id,
        volunteerId: volunteer.id,
        status: ClaimStatus.CLAIMED,
        etaMinutes: null,
      });

      await claimRepo.save(claim);

      // 6) Expire all OTHER pending offers for this request
      await offerRepo
        .createQueryBuilder()
        .update(DispatchOffer)
        .set({ status: DispatchOfferStatus.EXPIRED })
        .where('request_id = :requestId', { requestId: request.id })
        .andWhere('status = :status', { status: DispatchOfferStatus.PENDING })
        .andWhere('id != :offerId', { offerId: offer.id })
        .execute();

      return request;
    });
  }

  async declineOffer(offerId: string, volunteerUserId: string, declineReason: string | null) {
    const offer = await this.dispatchOfferRepo.findOne({
      where: { id: offerId },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    const volunteer = await this.volunteerRepo.findOne({
      where: { userId: volunteerUserId },
    });

    if (!volunteer || offer.volunteerId !== volunteer.id) {
      throw new ForbiddenException('Not your offer');
    }

    if (offer.status !== DispatchOfferStatus.PENDING) {
      throw new ConflictException('Offer is no longer available');
    }

    offer.status = DispatchOfferStatus.DECLINED;
    offer.declineReason = declineReason ?? null;
    await this.dispatchOfferRepo.save(offer);
    await this.dispatchOfferHistoryRepo.save({
      offerId: offer.id,
      requestId: offer.requestId,
      volunteerId: offer.volunteerId,
      action: DispatchOfferHistoryAction.DECLINED,
      notes: declineReason ?? null,
    });
    return { ok: true, offerId: offer.id, status: offer.status };
  }

  async getMyPendingOffers(userId: string) {
    const volunteer = await this.volunteerRepo.findOne({
      where: { userId },
    });

    if (!volunteer) {
      throw new NotFoundException('Volunteer profile not found');
    }

    const offers: PendingOfferRow[] = await this.dispatchOfferRepo
      .createQueryBuilder('offer')
      .leftJoin('offer.request', 'request')
      .leftJoin('profiles', 'p', 'p.id = request.requesterId')
      .where('offer.volunteerId = :volunteerId', { volunteerId: volunteer.id })
      .andWhere('offer.status = :status', { status: DispatchOfferStatus.PENDING })
      .orderBy('offer.createdAt', 'DESC')
      .select([
        'offer.id AS id',
        'offer.status AS status',
        'offer.createdAt AS createdAt',

        'request.id AS request_id',
        'request.requesterId AS requesterId',
        'request.type AS type',
        'request.fuelType AS fuelType',
        'request.status AS request_status',
        'request.createdAt AS request_createdAt',
        'request.pickupLat AS pickupLat',
        'request.pickupLng AS pickupLng',
        'request.pickupAddress AS pickupAddress',
        'request.notes AS notes',

        'p.selfie_path AS requesterSelfiePath',
        'request.notes AS notes',

        'p.selfie_path AS requesterSelfiePath',
        'p.full_name AS requesterName',
      ])
      .getRawMany();

    return offers.map((offer) => ({
      id: offer.id,
      status: offer.status,
      createdAt: offer.createdat,
      request: offer.request_id
        ? {
            id: offer.request_id,
            requesterId: offer.requesterid,
            requesterName: offer.requestername,
            requesterSelfiePath: offer.requesterselfiepath,
            type: offer.type,
            fuelType: offer.fueltype,
            status: offer.request_status,
            createdAt: offer.request_createdat,
            pickupLat: offer.pickuplat,
            pickupLng: offer.pickuplng,
            pickupAddress: offer.pickupaddress,
            notes: offer.notes,
          }
        : null,
    }));
  }
}
