import { Body, Controller, Post, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('subscribe')
  async subscribe(
    @Req() req: any,
    @Body()
    body: {
      endpoint: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    },
  ) {
    const requestUser =
      typeof req === 'object' && req !== null && 'user' in req
        ? (req as { user?: { sub?: string; id?: string } }).user
        : undefined;

    const userId = requestUser?.sub ?? requestUser?.id ?? '6efce26a-48de-4fb5-b259-7ffd6c5bef66';

    return this.notificationsService.saveSubscription({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
  }
}
