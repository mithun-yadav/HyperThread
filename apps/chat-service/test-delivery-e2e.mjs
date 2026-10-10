import { io } from 'socket.io-client';

const URL = 'http://localhost:4001';

const CONVERSATION_ID = 'b1e30364-2195-4863-bf60-0738615da9e1';
const MESSAGE_ID = '63c681ba-fa45-4143-876e-a946692ce8e9';

const users = [
  { name: 'sender', token: process.env.USER2_TOKEN },
  { name: 'recipient', token: process.env.USER1_TOKEN },
];

if (users.some((user) => !user.token)) {
  console.error('Missing USER1_TOKEN or USER2_TOKEN.');
  process.exit(1);
}

const clients = [];

function waitForEvent(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    function handler(data) {
      clearTimeout(timer);
      resolve(data);
    }

    socket.once(event, handler);
  });
}

async function connectUser(user) {
  const socket = io(URL, {
    auth: { token: user.token },
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000,
  });

  socket.onAny((event, ...args) => {
  console.log(`[${user.name}] received event:`, event, args);
});

  clients.push(socket);

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error(`${user.name} connection timed out`)), 6000);
  });

  console.log(`${user.name}: connected`);
  return socket;
}



async function joinConversation(socket, name) {
  socket.on('exception', (error) => {
    console.error(`[${name}] gateway exception:`, error);
  });

  socket.on('connect_error', (error) => {
    console.error(`[${name}] connection error:`, error.message);
  });

  const resultPromise = waitForEvent(socket, 'joinedConversation');

  socket.emit('joinConversation', CONVERSATION_ID);

  try {
    const result = await resultPromise;
    console.log(`${name}: join response`, result);
    return result;
  } catch (error) {
    console.error(`${name}: join failed`);
    throw error;
  }
}



try {
  const sender = await connectUser(users[0]);
  const recipient = await connectUser(users[1]);

  await Promise.all([
    joinConversation(sender, 'sender'),
    joinConversation(recipient, 'recipient'),
  ]);

  // Register listeners before sending the acknowledgement.
  const deliveredEvent = waitForEvent(sender, 'messageDelivered');
  const ackEvent = waitForEvent(recipient, 'deliveryAcknowledged');

  recipient.emit('acknowledgeDelivery', MESSAGE_ID);

  const [delivered, acknowledgement] = await Promise.all([
    deliveredEvent,
    ackEvent,
  ]);

  console.log('\nDelivery acknowledgement:', acknowledgement);
  console.log('\nSender notification:', delivered);

  if (
    delivered?.messageId !== MESSAGE_ID ||
    delivered?.status !== 'DELIVERED' ||
    acknowledgement?.messageId !== MESSAGE_ID ||
acknowledgement?.status !== 'DELIVERED'
  ) {
    throw new Error('Delivery acknowledgement did not match expectations');
  }

  console.log('\nPASS: delivery acknowledgement verified over Socket.IO.');
} catch (error) {
  console.error('\nFAIL:', error.message);
  process.exitCode = 1;
} finally {
  for (const socket of clients) {
    socket.disconnect();
  }
}