import { IsIn } from 'class-validator';

export class SwitchRoleDto {
  @IsIn(['driver', 'volunteer'])
  role!: 'driver' | 'volunteer';
}
