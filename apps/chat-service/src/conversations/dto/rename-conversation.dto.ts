import { IsString, Length } from 'class-validator';

export class RenameConversationDto {
  @IsString()
  @Length(2, 50)
  name!: string;
}
