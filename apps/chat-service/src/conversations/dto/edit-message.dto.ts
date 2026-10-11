import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class EditMessageDto {
  @IsNotEmpty()
  @Matches(/\S/)
  @IsString()
  @MaxLength(4000)
  content!: string;
}
