import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../types/request-user';

type AuthedRequest = Request & { user?: RequestUser };

@Injectable()
export class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const userId = String(req.headers['x-user-id'] ?? '').trim();
    const role = String(req.headers['x-role'] ?? '').trim();

    const canRequestHelp = req.headers['x-can-request-help'] === 'true';
    const canVolunteer = req.headers['x-can-volunteer'] === 'true';

    if (!userId || !role) {
      throw new UnauthorizedException('Missing x-user-id / x-role headers');
    }

    console.log('AUTH HEADER ROLE:', role);
    console.log('AUTH HEADER USER:', userId);

    console.log('AUTH HEADER canRequestHelp:', canRequestHelp);
    console.log('AUTH HEADER canVolunteer:', canVolunteer);

    req.user = {
      userId,
      role,
      canRequestHelp,
      canVolunteer,
    };

    return true;
  }
}
