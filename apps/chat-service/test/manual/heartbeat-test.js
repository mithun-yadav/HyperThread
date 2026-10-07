const { io } = require('socket.io-client');

const token = process.argv[2];

if (!token) {
  console.error('Usage: node heartbeat-test.js <ACCESS_TOKEN>');
  process.exit(1);
}

const socket = io('http://localhost:4001', {
  auth: { token },
});

let heartbeatInterval;

socket.on('connect', () => {
  console.log('CONNECTED:', socket.id);
  heartbeatInterval = setInterval(() => {
    console.log('SENDING HEARTBEAT ...');

    socket.emit('heartbeat', (response) => {
      console.log('HEARTBEAT RESPONSE', response);
    });
  }, 15000);
});

socket.on('connect_error', (error) => {
  console.error('CONNECT ERROR', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('DISCONNECTED', reason);
});

setTimeout(() => {
  console.log('TEST FINISHED');
  clearInterval(heartbeatInterval);
  socket.disconnect();
}, 70000);
