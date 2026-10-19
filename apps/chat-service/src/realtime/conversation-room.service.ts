import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationRoomService {
  private server: Server | null = null;

  constructor(private readonly prisma: PrismaService) {}

  registerServer(server: Server): void {
    this.server = server;
  }

  async emitToConversationMembers(
    conversationId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.server) {
      throw new Error('Socket.IO server is not registered');
    }

    const [members, sockets] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true },
      }),
      this.server.in(conversationId).fetchSockets(),
    ]);

    const memberIds = new Set(members.map((member) => member.userId));

    await Promise.all(
      sockets
        .filter(
          (socket) =>
            typeof socket.data.userId === 'string' &&
            memberIds.has(socket.data.userId),
        )
        .map((socket) => socket.emit(event, payload)),
    );
  }

  async removeUserFromConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    if (!this.server) {
      throw new Error('Socket.IO server is not registered');
    }

    const sockets = await this.server.in(conversationId).fetchSockets();

    await Promise.all(
      sockets
        .filter((socket) => socket.data.userId === userId)
        .map((socket) => socket.leave(conversationId)),
    );
  }
}
