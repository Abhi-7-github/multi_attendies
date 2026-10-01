require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Parse JSON and urlencoded payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration - allow localhost and 127.0.0.1 on any local port
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    ) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const ENGINE_PORT = parseInt(process.env.ENGINE_PORT || process.env.PORT, 10) || 5000;
const SERVER_HOSTNAME = process.env.SERVER_HOSTNAME || '127.0.0.1';
const HEALTH_CHECK_TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT, 10) || 2000;
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 5000;
const HEALTH_CHECK_PATH = process.env.HEALTH_CHECK_PATH || '/health';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT, 10) || 10000;

const NORMAL_SERVERS = [
  { port: parseInt(process.env.NORMAL_SERVER_1_PORT, 10) || 5001, healthy: true },
  { port: parseInt(process.env.NORMAL_SERVER_2_PORT, 10) || 5002, healthy: true },
  { port: parseInt(process.env.NORMAL_SERVER_3_PORT, 10) || 5003, healthy: true },
];

let currentServerIndex = 0;

// Health check for normal servers using fetch
async function checkServerHealth() {
  for (const server of NORMAL_SERVERS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
      const targetUrl = `http://${SERVER_HOSTNAME}:${server.port}${HEALTH_CHECK_PATH}`;
      
      const res = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      const isNowHealthy = res.status === 200;
      if (!server.healthy && isNowHealthy) {
        console.log(`✓ Server on port ${server.port} is healthy`);
      }
      server.healthy = isNowHealthy;
    } catch (err) {
      if (server.healthy) {
        console.warn(`⚠ Server on port ${server.port} health check failed: ${err.message}`);
      }
      server.healthy = false;
    }
  }
}

// Run health check at configured interval
setInterval(checkServerHealth, HEALTH_CHECK_INTERVAL);

// Get next healthy server using round robin
function getNextHealthyServer() {
  const healthyServers = NORMAL_SERVERS.filter((s) => s.healthy);

  if (healthyServers.length > 0) {
    let attempts = 0;
    while (attempts < NORMAL_SERVERS.length) {
      const server = NORMAL_SERVERS[currentServerIndex];
      currentServerIndex = (currentServerIndex + 1) % NORMAL_SERVERS.length;

      if (server.healthy) {
        return server;
      }
      attempts++;
    }
  }

  // Fallback if none marked healthy yet
  const fallbackServer = NORMAL_SERVERS[currentServerIndex];
  currentServerIndex = (currentServerIndex + 1) % NORMAL_SERVERS.length;
  return fallbackServer;
}

// Forward all requests to normal servers using fetch
app.use(async (req, res) => {
  let targetServer;
  try {
    targetServer = getNextHealthyServer();
  } catch (err) {
    console.error('Error selecting server:', err.message);
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const targetUrl = `http://${SERVER_HOSTNAME}:${targetServer.port}${req.originalUrl || req.url}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const forwardHeaders = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': req.headers['accept'] || 'application/json',
    };
    if (req.headers['authorization']) {
      forwardHeaders['Authorization'] = req.headers['authorization'];
    }

    const fetchOptions = {
      method: req.method,
      headers: forwardHeaders,
      signal: controller.signal,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        fetchOptions.body = req.body;
      }
    }

    const backendRes = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutId);

    const contentType = backendRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await backendRes.json();
      return res.status(backendRes.status).json(json);
    } else {
      const text = await backendRes.text();
      return res.status(backendRes.status).send(text);
    }
  } catch (err) {
    console.error(`Error forwarding request to server ${targetServer.port}:`, err.message);
    if (!res.headersSent) {
      if (err.name === 'AbortError') {
        return res.status(504).json({ error: 'Gateway timeout' });
      }
      return res.status(503).json({ error: 'Service temporarily unavailable' });
    }
  }
});

app.listen(ENGINE_PORT, '0.0.0.0', () => {
  console.log(`✓ Engine Server running on port ${ENGINE_PORT}`);
  console.log(`✓ Load balancing between normal servers on ports:`, NORMAL_SERVERS.map((s) => s.port).join(', '));
  setTimeout(checkServerHealth, 500);
});
