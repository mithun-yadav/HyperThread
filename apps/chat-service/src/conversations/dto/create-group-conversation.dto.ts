import { ArrayMinSize, IsArray, IsString, IsUUID, Length } from "class-validator";

export class CreateGroupConversationDto {
  @IsString()
  @Length(2,50)
  name!: string

  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', {each:true})
  memberIds!: string[];
}