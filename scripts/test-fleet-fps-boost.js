const io = require('socket.io-client');

const socket = io('https://artemia-pisonet-backend.onrender.com', { transports: ['websocket'] });

const results = [];

socket.on('connect', () => {
  console.log('--- Connected to Artemia Backend as Admin ---');
  socket.emit('admin:join');

  socket.on('maintenance:fps-boost:result', (data) => {
    console.log(`\n>>> [FPS BOOST RESULT RECEIVED] from PC: ${data.pcName || data.pcId}`);
    console.log(JSON.stringify(data, null, 2));
    results.push(data);
  });

  console.log('Dispatching ⚡ Fleet FPS Boost to ALL stations...');
  socket.emit('maintenance:fps-boost:run', {
    targetPcId: 'all',
    reqId: 'test-boost-' + Date.now()
  });

  setTimeout(() => {
    console.log(`\n========================================`);
    console.log(`Total results received: ${results.length}/3`);
    for (const r of results) {
      console.log(`- ${r.pcName || r.pcId}: Success=${r.success}, FreedRAM=${r.freedRamMb}MB, PowerPlan=${r.powerPlan}, Elapsed=${r.elapsedMs}ms`);
    }
    console.log(`========================================`);
    socket.disconnect();
    process.exit(0);
  }, 12000);
});
