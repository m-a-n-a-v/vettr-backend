import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`Starting VETTR Backend API on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`VETTR Backend API running at http://localhost:${port}`);
