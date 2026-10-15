const { io } = require('socket.io-client');

const token = process.env.JWT_ACCESS_TOKEN;
const messageId = process.env.MESSAGE_ID;

if (!token || !messageId) {
  console.error('JWT_ACCESS_TOKEN and MESSAGE_ID are required');
  process.exit(1);
}

const socket = io('http://localhost:4001', {
  auth: { token },
  timeout: 5000,
});

const timer = setTimeout(() => {
  console.error('Timed out waiting for acknowledgement');
  socket.disconnect();
  process.exitCode = 1;
}, 10000);

socket.on('connect', () => {
  console.log('Connected:', socket.id);

  socket.on('readAcknowledged', (data) => {
    clearTimeout(timer);
    console.log('Read acknowledgement received:', data);
    socket.disconnect();
  });

  socket.emit('acknowledgeRead', messageId);
});

socket.on('exception', (error) => {
  clearTimeout(timer);
  console.error('Socket exception:', error);
  socket.disconnect();
  process.exitCode = 1;
});

socket.on('connect_error', (error) => {
  clearTimeout(timer);
  console.error('Connection error:', error.message);
  process.exitCode = 1;
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
