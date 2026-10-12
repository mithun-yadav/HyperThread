import { Module } from '@nestjs/common';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { InternalUsersController } from './internal-users.controller';
import { InternalApiKeyGuard } from './guards/internal-api-key.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, InternalUsersController],
  providers: [AuthService, JwtAuthGuard, InternalApiKeyGuard],
  exports: [AuthService],
})
export class AuthModule {}
