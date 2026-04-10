import { Body, Controller, Get, Param, Patch, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Roles } from '../common/decorators/roles.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { HelpRequestsService } from '../help-requests/help-request.service';
import { VolunteersService } from '../volunteers/volunteers.service';

@Controller('admin')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly helpRequestsService: HelpRequestsService,
    private readonly volunteersService: VolunteersService,
  ) {}

  // ✅ GET profile
  @Get('profiles/flagged')
  async listFlaggedProfiles() {
    type FlaggedProfileRow = {
      id: string;
      role: string | null;
      active_role: string | null;
      can_request_help: boolean | null;
      can_volunteer: boolean | null;
      fraud_flag_count: number | null;
      fraud_reason: string | null;
    };

    const rowsUnknown: unknown = await this.dataSource.query(
      `
    select id, role, active_role, can_request_help, can_volunteer, fraud_flag_count, fraud_reason
    from public.profiles
    where fraud_flag_count >= 1
    order by fraud_flag_count desc, id asc
    `,
    );

    const rows = Array.isArray(rowsUnknown) ? (rowsUnknown as FlaggedProfileRow[]) : [];

    return rows;
  }
  @Get('profiles/:id')
  async getProfile(@Param('id', new ParseUUIDPipe()) id: string) {
    type AdminProfileRow = {
      id: string;
      role: string | null;
      active_role: string | null;
      can_request_help: boolean | null;
      can_volunteer: boolean | null;
      fraud_flag_count: number | null;
      fraud_reason: string | null;
    };

    const rowsUnknown: unknown = await this.dataSource.query(
      `
    select id, role, active_role, can_request_help, can_volunteer, fraud_flag_count, fraud_reason
    from public.profiles
    where id = $1
    limit 1
    `,
      [id],
    );

    const rows = Array.isArray(rowsUnknown) ? (rowsUnknown as AdminProfileRow[]) : [];

    return rows[0] ?? null;
  }

  // ✅ UPDATE fraud
  @Patch('profiles/:id/fraud')
  async updateFraud(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body: {
      fraudFlagCount?: number;
      fraudReason?: string | null;
    },
  ) {
    const fraudFlagCount = body.fraudFlagCount ?? 0;
    const fraudReason = body.fraudReason ?? null;

    type CurrentFraudRow = {
      fraud_flag_count: number | null;
      fraud_reason: string | null;
    };

    const currentRowsUnknown: unknown = await this.dataSource.query(
      `
    select fraud_flag_count, fraud_reason
    from public.profiles
    where id = $1
    limit 1
    `,
      [id],
    );

    const currentRows = Array.isArray(currentRowsUnknown)
      ? (currentRowsUnknown as CurrentFraudRow[])
      : [];

    const current = currentRows[0] ?? null;

    const isReset = fraudFlagCount === 0 && (fraudReason === null || fraudReason === '');

    if (isReset && current && (current.fraud_flag_count ?? 0) >= 1) {
      await this.dataSource.query(
        `
      insert into public.fraud_history
        ("userId", "fraudFlagCount", "fraudReason", action)
      values ($1, $2, $3, $4)
      `,
        [id, current.fraud_flag_count ?? 0, current.fraud_reason ?? null, 'RESET'],
      );
    }

    await this.dataSource.query(
      `
    update public.profiles
    set fraud_flag_count = $1,
        fraud_reason = $2
    where id = $3
    `,
      [fraudFlagCount, fraudReason, id],
    );

    return { success: true };
  }
  // Clear fraud flag (approve request)
  @Patch('requests/:id/clear-flag')
  clearFlag(@Param('id') id: string) {
    return this.helpRequestsService.clearFraudFlag(id);
  }

  // Mark as fraud
  @Patch('requests/:id/confirm-fraud')
  confirmFraud(@Param('id') id: string) {
    return this.helpRequestsService.confirmFraud(id);
  }

  // Warn user
  @Patch('users/:userId/warn')
  warnUser(@Param('userId') userId: string) {
    return this.volunteersService.warnUser(userId);
  }
}
