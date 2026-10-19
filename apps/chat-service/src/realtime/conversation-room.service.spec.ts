import { ConversationRoomService } from './conversation-room.service';
import { Server } from 'socket.io';

describe('ConversationRoomService', () => {
  let service: ConversationRoomService;
  let prisma: {
    conversationMember: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      conversationMember: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new ConversationRoomService(prisma as any);
  });

  describe('emitToConversationMembers', () => {
    it('emits only to sockets belonging to current members', async () => {
      const currentMemberSocket = {
        data: { userId: 'user-1' },
        emit: jest.fn(),
      };

      const revokedMemberSocket = {
        data: { userId: 'user-2' },
        emit: jest.fn(),
      };

      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'user-1' },
      ]);

      const fetchSockets = jest
        .fn()
        .mockResolvedValue([currentMemberSocket, revokedMemberSocket]);

      const server = {
        in: jest.fn().mockReturnValue({ fetchSockets }),
      };

      service.registerServer(server as unknown as Server);

      await service.emitToConversationMembers('conversation-1', 'newMessage', {
        id: 'message-1',
      });

      expect(prisma.conversationMember.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conversation-1' },
        select: { userId: true },
      });

      expect(currentMemberSocket.emit).toHaveBeenCalledWith('newMessage', {
        id: 'message-1',
      });

      expect(revokedMemberSocket.emit).not.toHaveBeenCalled();
    });

    it('does not emit if membership lookup fails', async () => {
      prisma.conversationMember.findMany.mockRejectedValue(
        new Error('Database unavailable'),
      );

      const socket = {
        data: { userId: 'user-1' },
        emit: jest.fn(),
      };

      const fetchSockets = jest.fn().mockResolvedValue([socket]);

      const server = {
        in: jest.fn().mockReturnValue({ fetchSockets }),
      };

      service.registerServer(server as unknown as Server);

      await expect(
        service.emitToConversationMembers('conversation-1', 'newMessage', {
          id: 'message-1',
        }),
      ).rejects.toThrow('Database unavailable');

      expect(socket.emit).not.toHaveBeenCalled();
    });
  });

  describe('removeUserFromConversation', () => {
    it('throws if the Socket.IO server has not been registered', async () => {
      await expect(
        service.removeUserFromConversation('conversation-1', 'user-1'),
      ).rejects.toThrow('Socket.IO server is not registered');
    });

    it('removes all sockets belonging to the target user from the room', async () => {
      const targetSocket1 = {
        data: { userId: 'user-1' },
        leave: jest.fn().mockResolvedValue(undefined),
      };

      const targetSocket2 = {
        data: { userId: 'user-1' },
        leave: jest.fn().mockResolvedValue(undefined),
      };

      const otherSocket = {
        data: { userId: 'user-2' },
        leave: jest.fn().mockResolvedValue(undefined),
      };

      const fetchSockets = jest
        .fn()
        .mockResolvedValue([targetSocket1, targetSocket2, otherSocket]);

      const server = {
        in: jest.fn().mockReturnValue({ fetchSockets }),
      };

      service.registerServer(server as unknown as Server);

      await service.removeUserFromConversation('conversation-1', 'user-1');

      expect(server.in).toHaveBeenCalledWith('conversation-1');
      expect(fetchSockets).toHaveBeenCalledTimes(1);
      expect(targetSocket1.leave).toHaveBeenCalledWith('conversation-1');
      expect(targetSocket2.leave).toHaveBeenCalledWith('conversation-1');
      expect(otherSocket.leave).not.toHaveBeenCalled();
    });

    it('propagates errors when fetching room sockets fails', async () => {
      const fetchSockets = jest
        .fn()
        .mockRejectedValue(new Error('Redis adapter unavailable'));

      const server = {
        in: jest.fn().mockReturnValue({ fetchSockets }),
      };

      service.registerServer(server as unknown as Server);

      await expect(
        service.removeUserFromConversation('conversation-1', 'user-1'),
      ).rejects.toThrow('Redis adapter unavailable');
    });

    it('propagates errors when leaving the room fails', async () => {
      const targetSocket = {
        data: { userId: 'user-1' },
        leave: jest.fn().mockRejectedValue(new Error('Room eviction failed')),
      };

      const server = {
        in: jest.fn().mockReturnValue({
          fetchSockets: jest.fn().mockResolvedValue([targetSocket]),
        }),
      };

      service.registerServer(server as unknown as Server);

      await expect(
        service.removeUserFromConversation('conversation-1', 'user-1'),
      ).rejects.toThrow('Room eviction failed');
    });
  });
});
