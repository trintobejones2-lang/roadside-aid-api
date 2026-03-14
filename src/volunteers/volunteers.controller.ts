import { Body, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { VolunteersService } from './volunteers.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReqUser } from '../common/decorators/req-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { SetVolunteerAvailabilityDto } from './dto/set-volunteer-availability.dto';

@Controller('volunteers')
@UseGuards(RolesGuard)
export class VolunteersController {
  constructor(private readonly volunteersService: VolunteersService) {}

  @Get('active-map')
  @Roles('volunteer')
  activeMap() {
    return this.volunteersService.getActiveMapVolunteers();
  }

  @Post('me')
  @Roles('volunteer')
  setAvailability(@ReqUser() user: RequestUser, @Body() dto: SetVolunteerAvailabilityDto) {
    return this.volunteersService.setAvailability(user.userId, dto);
  }
  @Post('location')
  @Roles('volunteer')
  updateLocation(@ReqUser() user: RequestUser, @Body() body: { lat: number; lng: number }) {
    return this.volunteersService.updateLocation(user.userId, body.lat, body.lng);
  }
}
