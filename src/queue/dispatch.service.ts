import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Volunteer } from '../volunteers/volunteer.entity';
import { DispatchOffer, DispatchOfferStatus } from './dispatch-offer.entity';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { HelpRequest, HelpRequestStatus } from '../help-requests/help-request.entity';
import { Claim, ClaimStatus } from '../help-requests/claim.entity';

@Injectable()
export class DispatchService {
  constructor(
    @InjectRepository(Volunteer)
    private readonly volunteerRepo: Repository<Volunteer>,

    @InjectRepository(DispatchOffer)
    private readonly dispatchOfferRepo: Repository<DispatchOffer>,

    @InjectRepository(HelpRequest)
    private readonly helpRequestRepo: Repository<HelpRequest>,
    @InjectRepository(Claim)
    private readonly claimRepo: Repository<Claim>,
  ) {}
  async acceptOffer(offerId: string, volunteerUserId: string) {
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
      }
      // 4) Accept this offer
      offer.status = DispatchOfferStatus.ACCEPTED;
      await offerRepo.save(offer);

      // 5) Claim the request
      request.status = HelpRequestStatus.CLAIMED;
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

    return { ok: true, offerId: offer.id, status: offer.status };
  }

  async getMyPendingOffers(userId: string) {
    const volunteer = await this.volunteerRepo.findOne({
      where: { userId },
    });

    if (!volunteer) {
      throw new NotFoundException('Volunteer profile not found');
    }

    const offers = await this.dispatchOfferRepo.find({
      where: {
        volunteerId: volunteer.id,
        status: DispatchOfferStatus.PENDING,
      },
      relations: {
        request: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return offers.map((offer) => ({
      id: offer.id,
      status: offer.status,
      createdAt: offer.createdAt,
      request: offer.request
        ? {
            id: offer.request.id,
            type: offer.request.type,
            fuelType: offer.request.fuelType,
            status: offer.request.status,
            createdAt: offer.request.createdAt,
            pickupLat: offer.request.pickupLat,
            pickupLng: offer.request.pickupLng,
            pickupAddress: offer.request.pickupAddress,
            notes: offer.request.notes,
          }
        : null,
    }));
  }
}
