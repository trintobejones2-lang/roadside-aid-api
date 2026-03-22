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

    const headerUserId =
      typeof req === 'object' &&
      req !== null &&
      'headers' in req &&
      typeof (req as { headers?: Record<string, unknown> }).headers === 'object' &&
      (req as { headers?: Record<string, unknown> }).headers !== null
        ? (req as { headers: Record<string, unknown> }).headers['x-user-id']
        : undefined;

    const userId =
      requestUser?.sub ??
      requestUser?.id ??
      (typeof headerUserId === 'string' ? headerUserId : undefined);

    if (!userId) {
      throw new Error('Missing user id for push subscription.');
    }

    return this.notificationsService.saveSubscription({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
  }
}
