const { io } = require('socket.io-client');
const { randomUUID } = require('crypto');

const senderToken = process.argv[2];
const receiverToken = process.argv[3];
const conversationId = process.argv[4];

if (!senderToken || !receiverToken || !conversationId) {
  console.error(
    'Usage: node test/socket-broadcast-test.js <senderToken> <receiverToken> <conversationId>',
  );
  process.exit(1);
}

const sender = io('http://localhost:4001', {
  auth: { token: senderToken },
  reconnection: false,
});

const receiver = io('http://localhost:4001', {
  auth: { token: receiverToken },
  reconnection: false,
});

let senderJoined = false;
let receiverJoined = false;

function sendMessage() {
  if (!senderJoined || !receiverJoined) return;

  console.log('➡️ Sender sending message');

  sender.emit('sendMessage', {
    conversationId,
    content: 'Hello from sender to receiver',
    idempotencyKey: randomUUID(),
  });
}

sender.on('connect', () => {
  console.log('🟢 SENDER CONNECTED:', sender.id);
  sender.emit('joinConversation', conversationId);
});

receiver.on('connect', () => {
  console.log('🟢 RECEIVER CONNECTED:', receiver.id);
  receiver.emit('joinConversation', conversationId);
});

sender.on('joinedConversation', () => {
  console.log('✅ SENDER JOINED');
  senderJoined = true;
  sendMessage();
});

receiver.on('joinedConversation', () => {
  console.log('✅ RECEIVER JOINED');
  receiverJoined = true;
  sendMessage();
});

sender.on('newMessage', (message) => {
  console.log('📨 SENDER RECEIVED MESSAGE');
  console.log(message);
});

receiver.on('newMessage', (message) => {
  console.log('📨 RECEIVER RECEIVED MESSAGE');
  console.log(message);

  sender.disconnect();
  receiver.disconnect();
});

sender.on('exception', (error) => {
  console.log('❌ SENDER EXCEPTION');
  console.log(error);
});

receiver.on('exception', (error) => {
  console.log('❌ RECEIVER EXCEPTION');
  console.log(error);
});

sender.on('connect_error', (error) => {
  console.log('❌ SENDER CONNECTION ERROR:', error.message);
});

receiver.on('connect_error', (error) => {
  console.log('❌ RECEIVER CONNECTION ERROR:', error.message);
});

sender.on('disconnect', (reason) => {
  console.log('🔴 SENDER DISCONNECTED:', reason);
});

receiver.on('disconnect', (reason) => {
  console.log('🔴 RECEIVER DISCONNECTED:', reason);
});