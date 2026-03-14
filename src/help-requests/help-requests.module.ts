import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpRequest } from './help-request.entity';
import { Claim } from './claim.entity';
import { Confirmation } from './confirmation.entity';
import { Volunteer } from '../volunteers/volunteer.entity';
import { HelpRequestsController } from './help-requests.controller';
import { HelpRequestsService } from './help-request.service';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [TypeOrmModule.forFeature([HelpRequest, Claim, Confirmation, Volunteer]), PointsModule],
  controllers: [HelpRequestsController],
  providers: [HelpRequestsService],
})
export class HelpRequestsModule {}
