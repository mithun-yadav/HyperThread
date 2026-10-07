import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  content!: string;

  @IsNotEmpty()
  @IsString()
  @IsUUID()
  idempotencyKey!: string;
}

export class SendSocketMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  content!: string;

  @IsNotEmpty()
  @IsString()
  @IsUUID()
  idempotencyKey!: string;
}
