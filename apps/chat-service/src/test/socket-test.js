const { io } = require('socket.io-client');

const token = process.argv[2];

const socket = io('http://localhost:4001', {
  auth: token
    ? {
        token,
      }
    : {},
  reconnection: false,
});

socket.on('connect', () => {
  console.log('✅ CONNECTED');
  console.log('Socket ID:', socket.id);

  setTimeout(() => {
    socket.disconnect();
  }, 3000);
});

socket.on('connect_error', (error) => {
  console.log('❌ CONNECTION ERROR');
  console.log(error.message);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 DISCONNECTED');
  console.log('Reason:', reason);

  process.exit(0);
});