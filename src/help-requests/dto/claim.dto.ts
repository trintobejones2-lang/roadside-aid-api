import { IsInt, IsOptional, Min } from 'class-validator';

export class ClaimDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  etaMinutes?: number;
}
