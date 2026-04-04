import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

type AuthedRequest = Request & {
  user?: { userId: string };
};

type SupabaseJwt = {
  sub: string;
};

function decodeJwtPayload(token: string): { sub?: string } | null {
  try {
    const parts = token.split('.');

    if (parts.length < 2) {
      return null;
    }

    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');

    return JSON.parse(json) as { sub?: string };
  } catch {
    return null;
  }
}
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
      const decoded = decodeJwtPayload(token) as SupabaseJwt | null;

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
