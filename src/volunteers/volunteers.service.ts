import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Volunteer } from './volunteer.entity';
import { SetVolunteerAvailabilityDto } from './dto/set-volunteer-availability.dto';

@Injectable()
export class VolunteersService {
  constructor(@InjectRepository(Volunteer) private repo: Repository<Volunteer>) {}

  async getActiveMapVolunteers() {
    const volunteers = await this.repo.find({
      where: { isAvailable: true },
    });

    return volunteers
      .filter((v) => v.lastLat != null && v.lastLng != null)
      .map((v) => ({
        id: v.id,
        userId: v.userId,
        lat: Number(v.lastLat),
        lng: Number(v.lastLng),
        isAvailable: v.isAvailable,
      }));
  }
  async getMe(userId: string) {
    let v = await this.repo.findOne({ where: { userId } });

    if (!v) {
      v = this.repo.create({
        userId,
        isAvailable: false,
      });

      v = await this.repo.save(v);
    }

    return {
      id: v.id,
      userId: v.userId,
      isAvailable: v.isAvailable,
      fuelRegular: v.fuelRegular,
      fuelDiesel: v.fuelDiesel,
      lastLat: v.lastLat != null ? Number(v.lastLat) : null,
      lastLng: v.lastLng != null ? Number(v.lastLng) : null,
      serviceRadiusKm: v.serviceRadiusKm,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }
  async setAvailability(userId: string, body: SetVolunteerAvailabilityDto) {
    let v = await this.repo.findOne({ where: { userId } });
    if (!v) v = this.repo.create({ userId });

    // ✅ Only update if the field exists on the request body
    if (body.isAvailable !== undefined) {
      v.isAvailable = body.isAvailable;
    }

    if (body.lat != undefined) {
      // Defensive check (DTO should catch it, but good for safety if pipes change)
      if (body.lat < -90 || body.lat > 90) {
        throw new BadRequestException('lat must be between -90 and 90');
      }
      // numeric -> string behavior in TypeORM/Postgres
      v.lastLat = String(body.lat);
    }

    if (body.lng != undefined) {
      if (body.lng < -180 || body.lng > 180) {
        throw new BadRequestException('lng must be between -180 and 180');
      }
      v.lastLng = String(body.lng);
    }

    if (body.serviceRadiusKm != undefined) {
      if (body.serviceRadiusKm < 1 || body.serviceRadiusKm > 200) {
        throw new BadRequestException('serviceRadiusKm must be between 1 and 200');
      }
      v.serviceRadiusKm = body.serviceRadiusKm;
    }
    if (body.fuelRegular !== undefined) {
      v.fuelRegular = body.fuelRegular;
    }

    if (body.fuelDiesel !== undefined) {
      v.fuelDiesel = body.fuelDiesel;
    }
    return this.repo.save(v);
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    if (lat < -90 || lat > 90) {
      throw new BadRequestException('lat must be between -90 and 90');
    }

    if (lng < -180 || lng > 180) {
      throw new BadRequestException('lng must be between -180 and 180');
    }

    let v = await this.repo.findOne({ where: { userId } });
    if (!v) v = this.repo.create({ userId });

    v.lastLat = String(lat);
    v.lastLng = String(lng);

    return this.repo.save(v);
  }
}
