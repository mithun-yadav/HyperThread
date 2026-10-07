const { io } = require('socket.io-client');
const { randomUUID } = require('crypto');

const token = process.argv[2];
const conversationId = process.argv[3];

if (!token || !conversationId) {
  console.error(
    'Usage: node test/socket-idempotency-test.js <token> <conversationId>',
  );
  process.exit(1);
}

const idempotencyKey = randomUUID();

const socket = io('http://localhost:4001', {
  auth: { token },
  reconnection: false,
});

let sendCount = 0;
let firstMessage = null;

socket.on('connect', () => {
  console.log('✅ CONNECTED');
  console.log('Socket ID:', socket.id);

  console.log('➡️ Joining conversation:', conversationId);

  socket.emit('joinConversation', conversationId);
});

socket.on('joinedConversation', () => {
  console.log('✅ JOINED CONVERSATION');

  console.log('➡️ Sending message #1');
socket.emit(
  'sendMessage',
  {
    conversationId,
    content: 'Idempotency test',
    idempotencyKey,
  },
  (message) => {
    console.log('✅ SEND #1 ACK');
    console.log(message);
  },
);
});

socket.on('newMessage', (message) => {
  sendCount++;

  console.log(`📨 BROADCAST #${sendCount}`);
  console.log(message);

  if (sendCount === 1) {
    firstMessage = message;

    console.log('➡️ Sending message #2 with SAME idempotencyKey');

    socket.emit(
      'sendMessage',
      {
        conversationId,
        content: 'Idempotency test',
        idempotencyKey,
      },
      (secondMessage) => {
        console.log('✅ SEND #2 ACK');
        console.log(secondMessage);

        console.log('\n🔎 COMPARISON');

        console.log('First message ID:', firstMessage.id);
        console.log('Second message ID:', secondMessage.id);

        console.log(
          'Same message ID:',
          firstMessage.id === secondMessage.id ? '✅ YES' : '❌ NO',
        );

        console.log(
          'Same idempotencyKey:',
          firstMessage.idempotencyKey === secondMessage.idempotencyKey
            ? '✅ YES'
            : '❌ NO',
        );

        console.log(
          'Broadcast count:',
          sendCount,
          sendCount === 1 ? '✅ CORRECT' : '❌ WRONG',
        );

        setTimeout(() => socket.disconnect(), 500);
      },
    );
  }
});

socket.on('exception', (error) => {
  console.log('❌ SOCKET EXCEPTION');
  console.log(error);

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