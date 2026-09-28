import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from  '@nestjs/common';
import type {Request} from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessageService } from './message.service';
import { SendMessageDto } from '../conversations/dto/send-message.dto';

@Controller('conversations/:conversationId/messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
    constructor(private readonly messageService: MessageService){}

    @Post()
    sendMessage(
        @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
        @Req() req: Request,
        @Body() dto: SendMessageDto
    ){
        return this.messageService.sendMessage(
            conversationId,
            req.user!.sub,
            dto
        );
    }
    @Get()
    getMessages(
        @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
        @Req() req: Request,
        @Query('limit') limit?: string
    ){
        const parsedLimit = limit === undefined ? 50 : Number(limit);

        if(!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100){
            throw new BadRequestException('limit must be between 1 and 100');
        }

        return this.messageService.getMessages(
            conversationId,
            req.user!.sub,
            parsedLimit
        );
    }
}