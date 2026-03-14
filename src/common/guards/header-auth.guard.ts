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

    if (!userId || !role) {
      throw new UnauthorizedException('Missing x-user-id / x-role headers');
    }

    req.user = { userId, role };
    return true;
  }
}
