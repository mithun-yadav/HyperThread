import { IsNotEmpty, IsUUID } from "class-validator";

export class CreateDirectConversationDto {
    @IsNotEmpty()
    @IsUUID()
    recipientId!: string;   
}