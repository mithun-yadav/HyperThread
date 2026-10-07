const { io } = require('socket.io-client');

const token = process.argv[2];

if (!token) {
  console.error('Usage: node presence-ttl-test.js <ACCESS_TOKEN>');
  process.exit(1);
}

const socket = io('http://localhost:4001', {
  auth: { token },
});

socket.on('connect', () => {
  console.log('CONNECTED:', socket.id);
  console.log('Waiting 35 seconds for Redis TTL to expire...');
});

socket.on('connect_error', (error) => {
  console.error('CONNECT ERROR:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('DISCONNECTED:', reason);
});

setTimeout(() => {
  console.log('35 SECONDS PASSED');
  console.log('Check Redis now for the presence key.');
  socket.disconnect();
}, 35000);
