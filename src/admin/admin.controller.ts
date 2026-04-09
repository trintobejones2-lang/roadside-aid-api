import { Body, Controller, Get, Param, Patch, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Roles } from '../common/decorators/roles.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('admin')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly dataSource: DataSource) {}

  // ✅ GET profile
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
      fraudReason?: string;
    },
  ) {
    const fraudFlagCount = body.fraudFlagCount ?? 0;
    const fraudReason = body.fraudReason ?? null;

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
}
