import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { HelpType } from '../help-request.entity';

export class CreateHelpRequestDto {
  @IsEnum(HelpType)
  type: HelpType;

  @IsNumber()
  pickupLat: number;

  @IsNumber()
  pickupLng: number;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
