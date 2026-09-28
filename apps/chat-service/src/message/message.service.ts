import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "../conversations/dto/send-message.dto";
import { Prisma } from "../generated/prisma/client";

@Injectable()
export class MessageService {
    constructor(private readonly prisma: PrismaService){}

    private async ensureMembership(conversationId: string, callerId: string){
        const membership = await this.prisma.conversationMember.findUnique({
            where: {
                conversationId_userId: {
                    conversationId,
                    userId: callerId
                }
            }
        });
        if(!membership){
            throw new NotFoundException({
                message: 'Conversation not found',
                errorCode: 'CONVERSATION_NOT_FOUND'
            });
        }
    return membership
    }

    async sendMessage(conversationId: string, callerId: string, dto: SendMessageDto){
        await this.ensureMembership(conversationId, callerId);

        try{
            return await this.prisma.message.create({
                data: {
                    conversationId,
                    senderId: callerId,
                    content:dto.content,
                    idempotencyKey: dto.idempotencyKey,
                }
            });
        }catch(error){
            if(
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
            ){
                const existing = await this.prisma.message.findUnique({
                    where:{
                        idempotencyKey: dto.idempotencyKey
                    },
                });
                if(existing) return existing
            }
            throw error;
        }
    }

    async getMessages(
        conversationId: string,
        callerId: string,
        limit:number = 50
    ){
        await this.ensureMembership(conversationId,callerId);
        
        const messages = await this.prisma.message.findMany({
            where:{conversationId},
            orderBy: {createdAt: "desc"},
            take: limit
        })
        return messages.reverse()
    }
}