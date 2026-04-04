import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { HeaderAuthGuard } from '../common/guards/header-auth.guard';
import { ReqUser } from '../common/decorators/req-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { SwitchRoleDto } from './dto/switch-role.dto';
import { AuthService } from './auth..service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('switch-role')
  @UseGuards(HeaderAuthGuard)
  switchRole(@ReqUser() user: RequestUser, @Body() body: SwitchRoleDto) {
    return this.authService.switchRole(user.userId, body.role);
  }
}
