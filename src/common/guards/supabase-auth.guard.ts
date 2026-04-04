import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import jwt from 'jsonwebtoken';

type AuthedRequest = Request & {
  user?: { userId: string };
};

type SupabaseJwt = {
  sub: string;
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      const decoded = jwt.decode(token) as SupabaseJwt | null;

      if (!decoded?.sub) {
        throw new UnauthorizedException('Invalid token');
      }

      req.user = {
        userId: decoded.sub,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Token verification failed');
    }
  }
}
