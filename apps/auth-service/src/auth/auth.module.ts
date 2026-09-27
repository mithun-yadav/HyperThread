import {Module} from '@nestjs/common';

import {AuthService} from './auth.service';
import {AuthController} from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';


@Module({
    imports:[JwtModule.register({})],
    controllers: [AuthController],
    providers: [AuthService,JwtAuthGuard],
    exports: [AuthService]
})

export class AuthModule {}