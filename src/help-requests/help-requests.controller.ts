import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import { HelpRequestsService } from './help-request.service';
import { CreateHelpRequestDto } from './dto/create-help-request.dto';
import { ClaimDto } from './dto/claim.dto';
import { StatusDto } from './dto/status.dto';

import { Roles } from '../common/decorators/roles.decorator';
import { ReqUser } from '../common/decorators/req-user.decorator';
import type { RequestUser } from '../common/types/request-user';

@Controller('help-requests')
export class HelpRequestsController {
  constructor(private service: HelpRequestsService) {}

  @Post()
  @Roles('user')
  create(@ReqUser() user: RequestUser, @Body() body: CreateHelpRequestDto) {
    return this.service.createRequest(user.userId, body);
  }

  @Get('open')
  @Roles('volunteer')
  open(
    @ReqUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    return this.service.listOpenForVolunteer(
      user.userId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      sort ?? 'distance',
    );
  }

  @Get('mine')
  @Roles('user')
  mine(@ReqUser() user: RequestUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.listMine(user.userId, page ? Number(page) : 1, limit ? Number(limit) : 20);
  }

  @Get('assigned')
  @Roles('volunteer')
  assigned(
    @ReqUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listAssigned(
      user.userId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Post(':id/claim')
  @Roles('volunteer')
  claim(
    @ReqUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ClaimDto,
  ) {
    return this.service.claimRequest(id, user.userId, body.etaMinutes);
  }

  @Post(':id/status')
  @Roles('volunteer')
  status(
    @ReqUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: StatusDto,
  ) {
    return this.service.updateStatus(id, body.status);
  }
  @Post(':id/cancel')
  @Roles('user')
  cancel(@ReqUser() user: RequestUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.cancelRequest(id, user.userId);
  }
  @Post(':id/confirm')
  @Roles('user')
  confirm(@ReqUser() user: RequestUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.confirm(id, user.userId);
  }
}
