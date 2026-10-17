import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessageService } from './message.service';
import { SendMessageDto } from '../conversations/dto/send-message.dto';
import { EditMessageDto } from '../conversations/dto/edit-message.dto';
import { MessageEventsService } from './message-events.service';
import { Throttle } from '@nestjs/throttler';

@Controller('conversations/:conversationId/messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly messageEventsService: MessageEventsService,
  ) {}
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async sendMessage(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Req() req: Request,
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.messageService.sendMessage(
      conversationId,
      req.user!.sub,
      dto,
    );

    return result.message;
  }
  @Get()
  getMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const parsedLimit = limit === undefined ? 50 : Number(limit);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    ) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    return this.messageService.getMessages(
      conversationId,
      req.user!.sub,
      parsedLimit,
      before,
    );
  }

  @Patch(':messageId')
  async editMessage(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Req() req: Request,
    @Body() dto: EditMessageDto,
  ) {
    const message = await this.messageService.editMessage(
      conversationId,
      messageId,
      req.user!.sub,
      dto,
    );

    this.messageEventsService.emitMessageEdited(conversationId, message);

    return message;
  }

  @Delete(':messageId')
  async deleteMessage(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Req() req: Request,
  ) {
    const message = await this.messageService.deleteMessage(
      conversationId,
      messageId,
      req.user!.sub,
    );

    this.messageEventsService.emitMessageDeleted(conversationId, message);

    return message;
  }
}
