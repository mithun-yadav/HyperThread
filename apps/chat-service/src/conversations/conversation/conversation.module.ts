import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { ConversationService } from "./conversations.service";
import { ConversationController } from "./conversation.controller";

@Module({
    imports: [AuthModule],
    controllers:[ConversationController],
    providers:[ConversationService]
})

export class ConversationModule {} 