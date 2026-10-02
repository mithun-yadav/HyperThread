const { io } = require('socket.io-client');

const token = process.argv[2];

if (!token) {
  console.error('❌ Access token is required');
  process.exit(1);
}

const conversationId = 'b1e30364-2195-4863-bf60-0738615da9e1';

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

  socket.disconnect();
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