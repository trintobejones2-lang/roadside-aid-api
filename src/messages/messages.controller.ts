import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { ReqUser } from '../common/decorators/req-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { RolesGuard } from '../common/guards/roles.guard';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Get(':requestId')
  @Roles('driver', 'volunteer')
  listByRequest(@Param('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.service.listByRequest(requestId);
  }

  @Post()
  @Roles('driver', 'volunteer')
  create(@ReqUser() user: RequestUser, @Body() body: CreateMessageDto) {
    return this.service.create(body.requestId, user.userId, body.body);
  }
}
