const io = require('socket.io-client');
const socket = io('https://artemia-pisonet-backend.onrender.com', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('Connected to backend as admin probe');
  socket.emit('admin:join');

  socket.on('fleet:status', (fleet) => {
    console.log('--- FLEET STATUS ---');
    console.log(JSON.stringify(fleet, null, 2));
    setTimeout(() => {
      socket.disconnect();
      process.exit(0);
    }, 1000);
  });
});

setTimeout(() => {
  console.log('Timeout waiting for fleet:status');
  socket.disconnect();
  process.exit(0);
}, 6000);
