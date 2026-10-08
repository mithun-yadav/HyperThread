import { IsUUID } from 'class-validator';

export class RemoveConversationMemberDto {
  @IsUUID()
  userId!: string;
}
