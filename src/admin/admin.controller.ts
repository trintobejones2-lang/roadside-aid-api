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
    const rows = await this.dataSource.query(
      `
      select id, role, fraud_flag_count, fraud_reason
      from public.profiles
      where id = $1
      limit 1
      `,
      [id],
    );

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
