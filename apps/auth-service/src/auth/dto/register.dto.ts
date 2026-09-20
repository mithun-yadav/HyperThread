import { IsEmail, IsNotEmpty, IsString, Length, Matches } from "class-validator";

export class RegisterDto {
    @IsNotEmpty()
    @IsString()
    @Length(3,30)
    @Matches(/^[a-zA-Z0-9_]+$/,{
        message: 'Username can only contain letters, numbers, and underscores',
    })
    username!: string;

    @IsNotEmpty()
    @IsString()
    @IsEmail()
    email!:string;

    @IsNotEmpty()
    @IsString()
    @Length(8, 128)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
  message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
})
    password!: string;
}