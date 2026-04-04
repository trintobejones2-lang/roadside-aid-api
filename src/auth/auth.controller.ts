import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ReqUser } from '../common/decorators/req-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { SwitchRoleDto } from './dto/switch-role.dto';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {
    console.log('AUTH CONTROLLER LOADED');
  }

  @Post('switch-role')
  @UseGuards(SupabaseAuthGuard)
  switchRole(@ReqUser() user: RequestUser, @Body() body: SwitchRoleDto) {
    return this.authService.switchRole(user.userId, body.role);
  }
}
