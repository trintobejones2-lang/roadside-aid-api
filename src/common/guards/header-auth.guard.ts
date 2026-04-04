import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import { RequestUser } from '../types/request-user';

type AuthedRequest = Request & { user?: RequestUser };

type ProfileRow = {
  id: string;
  role: string | null;
  active_role: string | null;
  can_request_help: boolean | null;
  can_volunteer: boolean | null;
};

@Injectable()
export class HeaderAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const userId = String(req.headers['x-user-id'] ?? '').trim();

    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    const rowsUnknown: unknown = await this.dataSource.query(
      `
  select
    id,
    role,
    active_role,
    can_request_help,
    can_volunteer
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

    const activeRole = profile.active_role?.trim() || profile.role?.trim() || null;
    const canRequestHelp = profile.can_request_help === true;
    const canVolunteer = profile.can_volunteer === true;

    if (!activeRole) {
      throw new UnauthorizedException('No active role set for this user');
    }

    req.user = {
      userId,
      role: activeRole,
      canRequestHelp,
      canVolunteer,
    };

    console.log('AUTH DB USER:', userId);
    console.log('AUTH DB activeRole:', activeRole);
    console.log('AUTH DB canRequestHelp:', canRequestHelp);
    console.log('AUTH DB canVolunteer:', canVolunteer);

    return true;
  }
}
