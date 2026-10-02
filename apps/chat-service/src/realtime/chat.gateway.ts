import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token ?? client.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      client.data.userId = payload.sub;
    } catch {
      client.disconnect();
      return;
    }
  }
  handleDisconnect(client: Socket) {}
}
