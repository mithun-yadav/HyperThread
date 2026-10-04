const { io } = require('socket.io-client');
const crypto = require('crypto');

const token = process.argv[2];
const conversationId = process.argv[3];

if (!token || !conversationId) {
  console.error(
    'Usage: node non-member-send-test.js <NON_MEMBER_ACCESS_TOKEN> <CONVERSATION_ID>',
  );
  process.exit(1);
}

const socket = io('http://localhost:4001', {
  auth: {
    token,
  },
});

socket.on('connect', () => {
  console.log('CONNECTED:', socket.id);
  console.log('SENDING AS NON-MEMBER...');

  socket.emit(
  'sendMessage',
  {
    conversationId,
    content: 'Non-member send test',
    idempotencyKey: crypto.randomUUID(),
  },
  (response) => {
    console.log('SERVER RESPONSE:', response);
  },
);

  socket.on('exception', (error) => {
    console.log('SERVER EXCEPTION:', error);

    setTimeout(() => {
      console.log('TEST FINISHED');
      socket.disconnect();
    }, 500);
  });
});

socket.on('newMessage', (message) => {
  console.log('UNEXPECTED BROADCAST:', message);
});

socket.on('connect_error', (error) => {
  console.error('CONNECT ERROR:', error.message);
});

socket.on('error', (error) => {
  console.error('SOCKET ERROR:', error);
});

socket.on('disconnect', (reason) => {
  console.log('DISCONNECTED:', reason);
});
