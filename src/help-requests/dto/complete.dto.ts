import { IsNumber } from 'class-validator';

export class CompleteDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}
