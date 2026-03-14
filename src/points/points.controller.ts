import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { PointsService } from './points.service';
import { Roles } from '../common/decorators/roles.decorator';
import { HeaderAuthGuard } from '../common/guards/header-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { RequestUser } from '../common/types/request-user';

type AuthedRequest = Request & { user: RequestUser };

@Controller()
export class PointsController {
  constructor(private readonly points: PointsService) {}

  // GET /points/me -> { points, rank }
  @Get('points/me')
  @UseGuards(HeaderAuthGuard, RolesGuard)
  @Roles('customer', 'volunteer', 'admin')
  async myPoints(@Req() req: AuthedRequest) {
    return this.points.getRankForUser(req.user.userId);
  }

  // GET /leaderboard?limit=10 -> [{ userId, points }]
  @Get('leaderboard')
  @UseGuards(HeaderAuthGuard, RolesGuard)
  @Roles('customer', 'volunteer', 'admin')
  async leaderboard(@Query('limit') limit?: string) {
    const n = limit ? Math.min(Math.max(Number(limit), 1), 50) : 10;
    return this.points.getLeaderboard(n);
  }

  // GET /ranks -> rank tiers for UI (public)
  @Get('ranks')
  async ranks() {
    return this.points.listRanks();
  }
}
