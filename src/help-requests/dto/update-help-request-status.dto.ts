import { IsEnum } from 'class-validator';
import { HelpRequestStatus } from '../help-request.entity';

export class UpdateHelpRequestStatusDto {
  @IsEnum(HelpRequestStatus)
  status: HelpRequestStatus;
}
