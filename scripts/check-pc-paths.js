const io = require('socket.io-client');
const socket = io('https://artemia-pisonet-backend.onrender.com', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('Connected to backend');
  socket.emit('admin:join');

  socket.on('maintenance:command:result', (data) => {
    console.log(`\n=== RESULT FROM ${data.pcId} ===`);
    console.log(data.stdout || data.output || data.error);
  });

  const cmd = `powershell -Command "(Get-Process -Name 'Artemia Customer Terminal').Path"`;
  console.log('Sending command to get process paths...');
  socket.emit('maintenance:command:run', {
    targetPcId: 'all',
    command: cmd,
    shell: 'cmd'
  });

  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 10000);
});
