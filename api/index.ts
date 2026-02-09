import { Hono } from 'hono';
import { app } from '../src/app.js';

// Re-export for Vercel's Hono framework detection
// The app is an OpenAPIHono instance (extends Hono)
export default app;
