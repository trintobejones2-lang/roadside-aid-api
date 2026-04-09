import { IsNumber } from 'class-validator';

export class ArriveDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}
