import { RemoveConversationMemberDto } from './../dto/remove-conversation-member.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConversationService } from './conversations.service';
import { CreateDirectConversationDto } from '../dto/create-direct-conversation.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import { CreateGroupConversationDto } from '../dto/create-group-conversation.dto';
import { AddConversationMemberDto } from '../dto/add-conversation-member.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  async getUserConversations(@Req() req: Request) {
    const userId = req.user!.sub;
    return this.conversationService.getUserConversations(userId);
  }

  @Get(':conversationId')
  async getConversation(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
  ) {
    const userId = req.user!.sub;
    const conversation = await this.conversationService.getConversation(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  @Post('direct')
  async createDirect(
    @Req() req: Request,
    @Body() dto: CreateDirectConversationDto,
  ) {
    const callerId = req.user!.sub;
    return this.conversationService.createDirect(callerId, dto);
  }

  @Post('group')
  async createGroup(
    @Req() req: Request,
    @Body() dto: CreateGroupConversationDto,
  ) {
    const callerId = req.user!.sub;
    return this.conversationService.createGroup(callerId, dto);
  }

  @Post(':conversationId/members')
  async addMember(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Body() dto: AddConversationMemberDto,
  ) {
    const callerId = req.user!.sub;

    return this.conversationService.addMember(
      callerId,
      conversationId,
      dto.userId,
    );
  }

  @Delete(':conversationId/members')
  async removeMember(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Body() dto: RemoveConversationMemberDto,
  ) {
    const callerId = req.user!.sub;

    return this.conversationService.removeMember(
      callerId,
      conversationId,
      dto.userId,
    );
  }

  @Delete(':conversationId/leave-group')
  async leaveGroup(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
  ) {
    const callerId = req.user!.sub;

    return this.conversationService.leaveGroup(callerId, conversationId);
  }
}
