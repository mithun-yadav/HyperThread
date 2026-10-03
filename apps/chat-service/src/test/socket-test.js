const { io } = require('socket.io-client');
const { randomUUID } = require('crypto');

const token = process.argv[2];
const conversationId = process.argv[3];

if (!token) {
  console.error('❌ Access token is required');
  process.exit(1);
}

const socket = io('http://localhost:4001', {
  auth: {
    token,
  },
  reconnection: false,
});

socket.on('connect', () => {
  console.log('✅ CONNECTED');
  console.log('Socket ID:', socket.id);

  console.log('➡️ Joining conversation:', conversationId);

  socket.emit('joinConversation', conversationId);
});

socket.on('joinedConversation', (data) => {
  console.log('✅ JOINED CONVERSATION');
  console.log(data);

  socket.emit('sendMessage', {
  conversationId,
  content: 'Hello from Socket.IO',
  idempotencyKey: randomUUID(),
});

  // socket.disconnect();
});

socket.on('connect_error', (error) => {
  console.log('❌ CONNECTION ERROR');
  console.log(error.message);

  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 DISCONNECTED');
  console.log('Reason:', reason);

  process.exit(0);
});

socket.on('exception', (error) => {
  console.log('❌ SOCKET EXCEPTION');
  console.log(error);

  socket.disconnect();
});

socket.on('newMessage', (message) => {
  console.log('📨 NEW MESSAGE');
  console.log(message);

  socket.disconnect();
});