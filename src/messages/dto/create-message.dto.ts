import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsUUID()
  requestId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}
