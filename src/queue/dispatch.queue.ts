import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class DispatchQueue {
  constructor(@InjectQueue('dispatch') private dispatchQueue: Queue) {}

  async addNewRequestJob(data: any) {
    await this.dispatchQueue.add('new-request', data);
  }

  async addStatusUpdateJob(data: any) {
    await this.dispatchQueue.add('status-update', data);
  }
  async addOfferTimeoutJob(offerId: string, requestId: string) {
    await this.dispatchQueue.add(
      'dispatch-offer-timeout',
      { offerId, requestId },
      {
        delay: 30 * 1000,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}
