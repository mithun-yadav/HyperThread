import { ConflictException, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(registerDto: RegisterDto) {
    const username = registerDto.username.toLowerCase();
    const email = registerDto.email.toLowerCase();

    const existingIdentity = await this.prisma.identity.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingIdentity) {
      throw new ConflictException({
        message: 'Email is already in use',
        errorCode: 'AUTH_EMAIL_ALREADY_EXISTS',
      });
    }

    const passwordHash = await argon2.hash(registerDto.password, {
      type: argon2.argon2id,
    });
    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          identities: {
            create: {
              provider: 'local',
              email,
              passwordHash,
            },
          },
        },
        select: {
          id: true,
          username: true,
        },
      });

      return {
        id: user.id,
        username: user.username,
        email,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target as string[] | undefined;

        if (target?.includes('username')) {
          throw new ConflictException({
            message: 'Username is already in use',
            errorCode: 'AUTH_USERNAME_ALREADY_EXISTS',
          });
        };

        if(target?.includes('email')){
            throw new ConflictException({
                message: 'Email is already in use',
                errorCode: 'AUTH_EMAIL_ALREADY_EXISTS',
            });
        }

        throw new ConflictException({
          message: 'Username or email is already in use',
          errorCode: 'AUTH_IDENTITY_ALREADY_EXISTS',
        });
      }
      throw error;
    }
  }
}
