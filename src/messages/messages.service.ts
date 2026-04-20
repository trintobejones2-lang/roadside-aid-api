import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Message } from './message.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private repo: Repository<Message>,
  ) {}

  async create(requestId: string, senderUserId: string, body: string) {
    const msg = this.repo.create({
      requestId,
      senderUserId,
      body,
    });

    return this.repo.save(msg);
  }

  async listByRequest(requestId: string) {
    return this.repo.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });
  }
}
