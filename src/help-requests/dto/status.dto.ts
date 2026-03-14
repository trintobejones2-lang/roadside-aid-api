import { IsEnum } from 'class-validator';
import { HelpRequestStatus } from '../help-request.entity';

export class StatusDto {
  @IsEnum(HelpRequestStatus)
  status: HelpRequestStatus;
}
