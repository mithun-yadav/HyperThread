import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthUserClientService } from './auth-user-client.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [JwtAuthGuard, AuthUserClientService],
  exports: [JwtAuthGuard, JwtModule, AuthUserClientService],
})
export class AuthModule {}
