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

const server = serve({
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

// Graceful shutdown — closes the HTTP server so in-flight requests can finish.
// On Vercel serverless the function is ephemeral so SIGTERM is a no-op there,
// but this protects local dev, Docker, and any future long-running deployments.
function shutdown(signal: string) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: 'shutdown_signal', signal }));
  server.close(() => {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: 'server_closed' }));
    process.exit(0);
  });
  // Force-exit after 10 s if requests don't drain in time
  setTimeout(() => {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: 'shutdown_timeout', signal }));
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
