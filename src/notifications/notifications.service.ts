import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';

import { PushSubscription } from './push-subscription.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(PushSubscription)
    private readonly repo: Repository<PushSubscription>,
  ) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
  }

  async saveSubscription(input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }) {
    const existing = await this.repo.findOne({
      where: { endpoint: input.endpoint },
    });

    if (existing) {
      existing.isActive = true;
      existing.updatedAt = new Date();
      return this.repo.save(existing);
    }

    const sub = this.repo.create({
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      isActive: true,
    });

    return this.repo.save(sub);
  }

  async sendToUser(
    userId: string,
    payload: {
      title: string;
      body: string;
      url: string;
    },
  ) {
    const subs = await this.repo.find({
      where: {
        userId,
        isActive: true,
      },
    });

    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
          }),
        );
      } catch (err: unknown) {
        console.error('Push failed', err);

        const statusCode =
          typeof err === 'object' &&
          err !== null &&
          'statusCode' in err &&
          typeof (err as { statusCode?: unknown }).statusCode === 'number'
            ? (err as { statusCode: number }).statusCode
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
          sub.isActive = false;
          await this.repo.save(sub);
        }
      }
    }
  }
}
