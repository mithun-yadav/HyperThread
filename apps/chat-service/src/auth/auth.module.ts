import { JwtModule } from "@nestjs/jwt";
import { Module } from "@nestjs/common";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Module({
    imports:[JwtModule.register({})],
    providers:[JwtAuthGuard],
    exports:[JwtAuthGuard, JwtModule]
})
export class AuthModule {} 