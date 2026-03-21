import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Volunteer } from '../volunteers/volunteer.entity';
import { HelpRequest } from '../help-requests/help-request.entity';
import { DispatchQueue } from './dispatch.queue';
import { DispatchWorker } from './dispatch.worker';
import { DispatchOffer } from './dispatch-offer.entity';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { Claim } from '../help-requests/claim.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,

    BullModule.forRoot({
      connection: {
        host: '127.0.0.1',
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'dispatch',
    }),
    TypeOrmModule.forFeature([Volunteer, HelpRequest, DispatchOffer, Claim]),
    RealtimeModule,
  ],
  providers: [DispatchQueue, DispatchWorker, DispatchService],
  controllers: [DispatchController],
  exports: [BullModule, DispatchQueue],
})
export class QueueModule {}
