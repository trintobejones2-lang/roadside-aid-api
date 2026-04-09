import { IsInt, IsOptional, Min, IsNumber } from 'class-validator';

export class ClaimDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  etaMinutes?: number;
}
