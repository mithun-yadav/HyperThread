import { IsUUID } from 'class-validator';

export class AddConversationMemberDto {
  @IsUUID('4')
  userId!: string;
}
