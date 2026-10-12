import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { InternalApiKeyGuard } from './guards/internal-api-key.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('internal/users')
@UseGuards(InternalApiKeyGuard)
export class InternalUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':userId')
  async findUser(@Param('userId') userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        message: 'user not found',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    return user;
  }
}
