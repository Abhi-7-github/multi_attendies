require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const enginePort = process.env.PORT || process.env.ENGINE_PORT || 5000;
const normal1Port = process.env.NORMAL_SERVER_1_PORT || 5001;
const normal2Port = process.env.NORMAL_SERVER_2_PORT || 5002;
const normal3Port = process.env.NORMAL_SERVER_3_PORT || 5003;

const servers = [
  { name: 'Engine Server', script: 'engine-server.js', env: { ENGINE_PORT: enginePort, PORT: enginePort } },
  { name: 'Normal Server 1', script: 'normal-server.js', env: { PORT: normal1Port } },
  { name: 'Normal Server 2', script: 'normal-server.js', env: { PORT: normal2Port } },
  { name: 'Normal Server 3', script: 'normal-server.js', env: { PORT: normal3Port } },
];

console.log('Starting PresenceX servers...\n');

const children = [];

servers.forEach((server) => {
  const env = { ...process.env, ...server.env };
  const child = spawn('node', [path.join(__dirname, server.script)], { env, stdio: 'inherit' });
  children.push(child);

  child.on('error', (err) => {
    console.error(`Error starting ${server.name}:`, err.message);
  });

  child.on('exit', (code) => {
    console.log(`${server.name} exited with code ${code}`);
  });
});

console.log('All servers started. Press Ctrl+C to stop all servers.\n');

// Handle graceful shutdown
let isShuttingDown = false;
const cleanup = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\nShutting down all servers...');
  children.forEach((child) => {
    try {
      child.kill();
    } catch (e) {}
  });
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);