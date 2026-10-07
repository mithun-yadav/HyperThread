const { io } = require('socket.io-client');

const token = process.argv[2];
const conversationId = process.argv[3];

if (!token || !conversationId) {
  console.error(
    'Usage: node test/socket-reconnect-test.js <token> <conversationId>',
  );
  process.exit(1);
}

let socket;
let connectionCount = 0;

function connectSocket() {
  socket = io('http://localhost:4001', {
    auth: { token },
    reconnection: false,
  });

  socket.on('connect', () => {
    connectionCount++;

    console.log(`\n🟢 CONNECTED #${connectionCount}:`, socket.id);

    console.log('➡️ Joining conversation:', conversationId);

    socket.emit('joinConversation', conversationId);
  });

  socket.on('joinedConversation', () => {
    console.log(`✅ JOINED #${connectionCount}`);

    if (connectionCount === 1) {
      console.log('🔌 Disconnecting first connection...');
      socket.disconnect();
    }

    if (connectionCount === 2) {
      console.log('✅ Reconnected and joined again');
      console.log('🛑 Test complete');

      socket.disconnect();
    }
  });

  socket.on('connect_error', (error) => {
    console.log('❌ CONNECTION ERROR');
    console.log(error.message);
  });

  socket.on('exception', (error) => {
    console.log('❌ SOCKET EXCEPTION');
    console.log(error);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔴 DISCONNECTED:', reason);

    if (connectionCount === 1) {
      console.log('🔄 Starting second connection...\n');

      setTimeout(() => {
        connectSocket();
      }, 500);
    }

    if (connectionCount === 2) {
      process.exit(0);
    }
  });
}

connectSocket();