import { IsNotEmpty, IsString } from 'class-validator';
export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  refreshToken!: string;
}
