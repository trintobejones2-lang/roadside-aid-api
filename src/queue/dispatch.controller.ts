import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { Roles } from '../common/decorators/roles.decorator';
import { ReqUser } from '../common/decorators/req-user.decorator';
import type { RequestUser } from '../common/types/request-user';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('offers/mine')
  @Roles('volunteer')
  getMyPendingOffers(@ReqUser() user: RequestUser) {
    return this.dispatchService.getMyPendingOffers(user.userId);
  }

  @Post('offers/:id/accept')
  @Roles('volunteer')
  acceptOffer(@Param('id') id: string, @ReqUser() user: RequestUser) {
    return this.dispatchService.acceptOffer(id, user.userId);
  }
  @Post('offers/:id/decline')
  @Roles('volunteer')
  declineOffer(
    @Param('id') id: string,
    @ReqUser() user: RequestUser,
    @Body() body: { declineReason?: string },
  ) {
    return this.dispatchService.declineOffer(id, user.userId, body.declineReason ?? null);
  }
}
