import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type SwitchRoleResult = {
  success: true;
  activeRole: 'driver' | 'volunteer';
  message: string;
};

@Injectable()
export class AuthService {
  constructor(private readonly dataSource: DataSource) {}

  async switchRole(userId: string, targetRole: 'driver' | 'volunteer'): Promise<SwitchRoleResult> {
    console.log('SWITCH ROLE start', { userId, targetRole });
    const activeRequestStatuses = ['OPEN', 'CLAIMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

    const activeRequestsUnknown: unknown = await this.dataSource.query(
      `
      select id, status
      from public.help_requests
      where "requesterId" = $1
        and status = any($2)
      limit 1
      `,
      [userId, activeRequestStatuses],
    );

    const activeRequests = Array.isArray(activeRequestsUnknown)
      ? (activeRequestsUnknown as Array<{ id: string; status: string }>)
      : [];
    console.log('SWITCH ROLE activeRequests', activeRequests);
    if (activeRequests.length > 0) {
      throw new ForbiddenException(
        'You cannot switch roles while you have an active roadside request.',
      );
    }

    const activeVolunteerJobsUnknown: unknown = await this.dataSource.query(
      `
      select d.id
      from public.dispatch_offers d
      join public.help_requests h on h.id = d.request_id
      join public.volunteers v on v.id = d.volunteer_id
      where v."userId" = $1
        and d.status = 'ACCEPTED'
        and h.status = any($2)
      limit 1
      `,
      [userId, activeRequestStatuses],
    );

    const activeVolunteerJobs = Array.isArray(activeVolunteerJobsUnknown)
      ? (activeVolunteerJobsUnknown as Array<{ id: string }>)
      : [];
    console.log('SWITCH ROLE activeVolunteerJobs', activeVolunteerJobs);
    if (activeVolunteerJobs.length > 0) {
      throw new ForbiddenException(
        'You cannot switch roles while you have an active accepted assignment.',
      );
    }

    const profilesUnknown: unknown = await this.dataSource.query(
      `
      select id, can_request_help, can_volunteer
      from public.profiles
      where id = $1
      limit 1
      `,
      [userId],
    );

    const profiles = Array.isArray(profilesUnknown)
      ? (profilesUnknown as Array<{
          id: string;
          can_request_help: boolean | null;
          can_volunteer: boolean | null;
        }>)
      : [];

    const profile = profiles[0] ?? null;
    console.log('SWITCH ROLE profile', profile);
    if (!profile) {
      throw new BadRequestException('Profile not found');
    }

    if (targetRole === 'driver' && profile.can_request_help !== true) {
      throw new ForbiddenException('Your account cannot switch to driver mode.');
    }

    if (targetRole === 'volunteer' && profile.can_volunteer !== true) {
      throw new ForbiddenException('Your account cannot switch to volunteer mode.');
    }
    console.log('SWITCH ROLE updating active_role', { userId, targetRole });
    await this.dataSource.query(
      `
      update public.profiles
      set active_role = $2
      where id = $1
      `,
      [userId, targetRole],
    );

    return {
      success: true,
      activeRole: targetRole,
      message: `Switched to ${targetRole} mode.`,
    };
  }
}
