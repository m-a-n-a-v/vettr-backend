import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config/env.js';

const port = parseInt(process.env.PORT || '3000', 10);
const version = '1.0.0';

// Structured startup logging
const startupLog = {
  timestamp: new Date().toISOString(),
  event: 'server_starting',
  version,
  environment: env.NODE_ENV,
  port,
};

console.log(JSON.stringify(startupLog));

serve({
  fetch: app.fetch,
  port,
});

// Structured ready logging
const readyLog = {
  timestamp: new Date().toISOString(),
  event: 'server_ready',
  version,
  environment: env.NODE_ENV,
  port,
  url: `http://localhost:${port}`,
};

console.log(JSON.stringify(readyLog));
