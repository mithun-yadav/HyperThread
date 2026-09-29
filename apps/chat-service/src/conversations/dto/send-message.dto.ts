import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";

export class SendMessageDto{
    @IsNotEmpty()
    @IsString()
    @MaxLength(4000)
    content!: string

    @IsString()
    @IsUUID()
    idempotencyKey!:string
}