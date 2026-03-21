import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Volunteer } from '../volunteers/volunteer.entity';
import {
  HelpRequest,
  HelpRequestStatus,
  FuelType,
  HelpType,
} from '../help-requests/help-request.entity';
import { DispatchOffer, DispatchOfferStatus } from './dispatch-offer.entity';
import { DispatchQueue } from './dispatch.queue';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Processor('dispatch')
export class DispatchWorker extends WorkerHost {
  constructor(
    @InjectRepository(Volunteer)
    private readonly volunteerRepo: Repository<Volunteer>,

    @InjectRepository(HelpRequest)
    private readonly helpRequestRepo: Repository<HelpRequest>,

    @InjectRepository(DispatchOffer)
    private readonly dispatchOfferRepo: Repository<DispatchOffer>,

    private readonly notificationsService: NotificationsService,

    private readonly dispatchQueue: DispatchQueue,
    private readonly realtime: RealtimeGateway,
  ) {
    super();
  }

  private getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;

    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
  }

  private async createOffersForRequest(request: HelpRequest) {
    console.log('Creating dispatch offers for request:', request.id);

    const volunteers = await this.volunteerRepo.find({
      where: { isAvailable: true },
    });

    console.log(
      'Candidate volunteers before distance filter:',
      volunteers.map((v) => ({
        id: v.id,
        userId: v.userId,
        lat: v.lastLat,
        lng: v.lastLng,
        serviceRadiusKm: v.serviceRadiusKm,
      })),
    );

    const requestLat = Number(request.pickupLat);
    const requestLng = Number(request.pickupLng);

    if (Number.isNaN(requestLat) || Number.isNaN(requestLng)) {
      console.log('Request has invalid coordinates:', {
        requestId: request.id,
        pickupLat: request.pickupLat,
        pickupLng: request.pickupLng,
      });
      return;
    }

    const nearbyVolunteers = volunteers
      .map((v) => {
        const volunteerLat = Number(v.lastLat);
        const volunteerLng = Number(v.lastLng);
        const radiusKm = Number(v.serviceRadiusKm);

        if (Number.isNaN(volunteerLat) || Number.isNaN(volunteerLng) || Number.isNaN(radiusKm)) {
          console.log('Skipping volunteer with invalid coordinates/radius:', {
            volunteerId: v.id,
            userId: v.userId,
            volunteerLat: v.lastLat,
            volunteerLng: v.lastLng,
            serviceRadiusKm: v.serviceRadiusKm,
          });
          return null;
        }

        const distanceKm = this.getDistanceKm(requestLat, requestLng, volunteerLat, volunteerLng);
        const requestAgeMs = Date.now() - new Date(request.createdAt).getTime();

        let extraRadiusKm = 0;

        if (requestAgeMs >= 30 * 1000) {
          extraRadiusKm = 5;
        }

        if (requestAgeMs >= 60 * 1000) {
          extraRadiusKm = 10;
        }

        if (requestAgeMs >= 120 * 1000) {
          extraRadiusKm = 20;
        }

        const effectiveRadiusKm = radiusKm + extraRadiusKm;

        let matches = distanceKm <= effectiveRadiusKm;

        if (matches && request.type === HelpType.GAS) {
          if (request.fuelType === FuelType.REGULAR && !v.fuelRegular) {
            matches = false;
          }

          if (request.fuelType === FuelType.DIESEL && !v.fuelDiesel) {
            matches = false;
          }
        }

        console.log('Volunteer distance check:', {
          volunteerId: v.id,
          userId: v.userId,
          volunteerLat,
          volunteerLng,
          serviceRadiusKm: radiusKm,
          requestAgeMs,
          effectiveRadiusKm,
          distanceKm,
          fuelRegular: v.fuelRegular,
          fuelDiesel: v.fuelDiesel,
          requestType: request.type,
          requestFuelType: request.fuelType,
          matches,
        });

        if (!matches) return null;

        return {
          volunteer: v,
          distanceKm,
        };
      })
      .filter((item): item is { volunteer: Volunteer; distanceKm: number } => item !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map((item) => item.volunteer);

    console.log(
      'Nearby volunteers after distance sort:',
      nearbyVolunteers.map((v) => ({
        id: v.id,
        userId: v.userId,
        lat: v.lastLat,
        lng: v.lastLng,
        serviceRadiusKm: v.serviceRadiusKm,
      })),
    );

    console.log('About to create dispatch offers. Count =', nearbyVolunteers.length);
    console.log(
      'Dispatch order (closest first):',
      nearbyVolunteers.map((v) => ({
        id: v.id,
        userId: v.userId,
      })),
    );
    const requestAgeMs = Date.now() - new Date(request.createdAt).getTime();

    let maxOffers = 3;

    if (requestAgeMs >= 30 * 1000) {
      maxOffers = 5;
    }

    if (requestAgeMs >= 60 * 1000) {
      maxOffers = nearbyVolunteers.length;
    }
    console.log('Dispatch wave:', {
      requestId: request.id,
      requestAgeMs,
      maxOffers,
      nearbyCount: nearbyVolunteers.length,
    });
    let createdOffers = 0;
    for (const volunteer of nearbyVolunteers.slice(0, maxOffers)) {
      try {
        console.log('Checking existing dispatch offer for:', {
          requestId: request.id,
          volunteerId: volunteer.id,
        });

        const existingOffer = await this.dispatchOfferRepo.findOne({
          where: {
            requestId: request.id,
            volunteerId: volunteer.id,
          },
        });

        if (
          existingOffer &&
          (existingOffer.status === DispatchOfferStatus.PENDING ||
            existingOffer.status === DispatchOfferStatus.ACCEPTED)
        ) {
          console.log('Active dispatch offer already exists:', {
            requestId: request.id,
            volunteerId: volunteer.id,
            offerId: existingOffer.id,
            status: existingOffer.status,
          });
          continue;
        }

        if (existingOffer && existingOffer.status === DispatchOfferStatus.DECLINED) {
          console.log('Volunteer already declined this request, skipping:', {
            requestId: existingOffer.requestId,
            volunteerId: existingOffer.volunteerId,
            offerId: existingOffer.id,
            status: existingOffer.status,
          });

          continue;
        }

        if (existingOffer && existingOffer.status === DispatchOfferStatus.EXPIRED) {
          existingOffer.status = DispatchOfferStatus.PENDING;
          existingOffer.expiresAt = new Date(Date.now() + 30 * 1000);

          await this.dispatchOfferRepo.save(existingOffer);

          await this.notificationsService.sendToUser(volunteer.userId, {
            title: 'RoadsideAid',
            body: `New ${request.type} request nearby. Tap to open offers.`,
            url: '/open-requests',
          });

          createdOffers += 1;
          await this.dispatchQueue.addOfferTimeoutJob(existingOffer.id, existingOffer.requestId);

          console.log('Dispatch offer reactivated:', {
            offerId: existingOffer.id,
            requestId: existingOffer.requestId,
            volunteerId: existingOffer.volunteerId,
            status: existingOffer.status,
            expiresAt: existingOffer.expiresAt,
          });

          this.realtime.server.emit('dispatch_offer_created', {
            offerId: existingOffer.id,
            requestId: existingOffer.requestId,
            volunteerId: existingOffer.volunteerId,
          });

          continue;
        }
        const expiresAt = new Date(Date.now() + 30 * 1000);

        const offer = this.dispatchOfferRepo.create({
          requestId: request.id,
          volunteerId: volunteer.id,
          status: DispatchOfferStatus.PENDING,
          expiresAt,
        });

        await this.dispatchOfferRepo.save(offer);

        await this.notificationsService.sendToUser(volunteer.userId, {
          title: 'RoadsideAid',
          body: `New ${request.type} request nearby. Tap to open offers.`,
          url: '/open-requests',
        });
        createdOffers += 1;
        await this.dispatchQueue.addOfferTimeoutJob(offer.id, offer.requestId);

        console.log('Queued dispatch offer timeout job:', {
          offerId: offer.id,
          requestId: offer.requestId,
          expiresAt: offer.expiresAt,
        });

        console.log('Dispatch offer created:', {
          offerId: offer.id,
          requestId: offer.requestId,
          volunteerId: offer.volunteerId,
          status: offer.status,
        });
        this.realtime.server.emit('dispatch_offer_created', {
          offerId: offer.id,
          requestId: offer.requestId,
          volunteerId: offer.volunteerId,
        });
      } catch (error) {
        console.error('Dispatch offer creation failed:', error);
      }
    }
    if (createdOffers === 0) {
      console.log('No eligible volunteers remaining for request:', request.id);

      if (request.status !== HelpRequestStatus.OPEN) {
        request.status = HelpRequestStatus.OPEN;
        await this.helpRequestRepo.save(request);
      }
    } else {
      console.log('Created dispatch offers count:', createdOffers);
    }
  }
  async process(job: Job) {
    switch (job.name) {
      case 'new-request': {
        console.log('Processing new request job', job.data);

        const { requestId } = job.data as { requestId: string };

        const request = await this.helpRequestRepo.findOne({
          where: { id: requestId },
        });

        if (!request) {
          console.log('Request not found for job:', requestId);
          break;
        }

        console.log('Request location:', {
          requestId: request.id,
          pickupLat: request.pickupLat,
          pickupLng: request.pickupLng,
          pickupAddress: request.pickupAddress,
        });

        await this.createOffersForRequest(request);

        break;
      }

      case 'dispatch-offer-timeout': {
        console.log('Processing dispatch offer timeout job', job.data);

        const { offerId, requestId } = job.data as {
          offerId: string;
          requestId: string;
        };

        const offer = await this.dispatchOfferRepo.findOne({
          where: { id: offerId },
        });

        if (!offer) {
          console.log('Offer not found for timeout:', offerId);
          break;
        }

        if (offer.status !== DispatchOfferStatus.PENDING) {
          console.log('Offer already handled, skipping timeout:', {
            offerId: offer.id,
            status: offer.status,
          });
          break;
        }

        offer.status = DispatchOfferStatus.EXPIRED;
        await this.dispatchOfferRepo.save(offer);

        console.log('Dispatch offer expired:', {
          offerId: offer.id,
          requestId,
          volunteerId: offer.volunteerId,
        });

        const request = await this.helpRequestRepo.findOne({
          where: { id: requestId },
        });

        if (!request) {
          console.log('Request not found during reassign:', requestId);
          break;
        }

        if (request.status !== HelpRequestStatus.OPEN) {
          console.log('Request is no longer open, skipping reassign:', {
            requestId: request.id,
            status: request.status,
          });
          break;
        }

        const createdAtMs = new Date(request.createdAt).getTime();
        const ageMs = Date.now() - createdAtMs;
        const maxDispatchWindowMs = 30 * 60 * 1000; // 30 minutes

        if (ageMs > maxDispatchWindowMs) {
          request.status = HelpRequestStatus.EXPIRED;
          await this.helpRequestRepo.save(request);

          console.log('Request expired after dispatch window:', {
            requestId: request.id,
            createdAt: request.createdAt,
            ageMs,
          });

          break;
        }

        await this.createOffersForRequest(request);

        break;
      }

      case 'status-update':
        console.log('Processing status update job', job.data);
        break;

      default:
        console.log('Unknown job type', job.name);
    }
  }
}
