import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ConversationService } from "./conversations.service";
import { CreateDirectConversationDto } from "../dto/create-direct-conversation.dto";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type {Request} from "express";
import { CreateGroupConversationDto } from "../dto/create-group-conversation.dto";

@Controller('conversations')
@UseGuards(JwtAuthGuard)

export class ConversationController {
    constructor(private readonly conversationService: ConversationService) {}

    @Post('direct')
    async createDirect(@Req() req: Request, @Body() dto: CreateDirectConversationDto){
        const callerId = req.user!.sub;
        return this.conversationService.createDirect(callerId, dto)
    }

    @Post('group')
    async createGroup(@Req() req: Request, @Body() dto: CreateGroupConversationDto){
        const callerId = req.user!.sub;
        return this.conversationService.createGroup(callerId, dto)
    }
}
