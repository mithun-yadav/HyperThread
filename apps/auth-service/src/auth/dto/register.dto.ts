import { IsEmail, IsNotEmpty, IsString, Length, Matches } from "class-validator";

export class RegisterDto {
    @IsNotEmpty()
    @IsString()
    @Length(3,30)
    @Matches(/^[a-zA-Z0-9_]+$/,{
        message: 'Username can only contain letters, numbers and uppercase',
    })
    username!: string;

    @IsNotEmpty()
    @IsEmail()
    @IsString()
    email!:string;

    @IsNotEmpty()
    @IsString()
    @Length(8, 128)
    @Matches(/[A-Z]/, {
        message: 'Password must contain one uppercase letter'
    })
    @Matches(/[a-z]/, {
        message: 'Password must contain one lower case letter'
    })
    @Matches(/[0-9]/, {
        message: 'Password must contain at least one number'
    })
    password!: string;
}