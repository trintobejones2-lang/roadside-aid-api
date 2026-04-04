import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import jwt from 'jsonwebtoken';

type AuthedRequest = Request & {
  user?: {
    userId: string;
    canRequestHelp: boolean;
    canVolunteer: boolean;
  };
};

type SupabaseJwt = {
  sub: string;
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    const decoded = jwt.decode(token) as SupabaseJwt | null;

    if (!decoded?.sub) {
      throw new UnauthorizedException('Invalid token');
    }

    const userId = decoded.sub;

    // 🔥 FETCH PROFILE FROM DB
    type ProfileRow = {
      can_request_help?: boolean | null;
      can_volunteer?: boolean | null;
      canRequestHelp?: boolean | null;
      canVolunteer?: boolean | null;
    };

    const rowsUnknown: unknown = await this.dataSource.query(
      `
  select *
  from public.profiles
  where id = $1
  limit 1
  `,
      [userId],
    );

    const rows = Array.isArray(rowsUnknown) ? (rowsUnknown as ProfileRow[]) : [];
    const profile = rows[0] ?? null;

    if (!profile) {
      throw new UnauthorizedException('Profile not found');
    }

    req.user = {
      userId,
      canRequestHelp: profile.can_request_help === true || profile.canRequestHelp === true,
      canVolunteer: profile.can_volunteer === true || profile.canVolunteer === true,
    };

    return true;
  }
}
