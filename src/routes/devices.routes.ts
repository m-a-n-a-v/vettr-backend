import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { registerDevice, unregisterDevice } from '../services/device-token.service.js';
import { success } from '../utils/response.js';
import { ValidationError } from '../utils/errors.js';

type Variables = {
  user: AuthUser;
};

const deviceRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware
deviceRoutes.use('*', authMiddleware);

const registerSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  token: z.string().min(1).max(512),
});

const unregisterSchema = z.object({
  token: z.string().min(1).max(512),
});

/**
 * POST /devices/register
 * Register a device token for push notifications
 */
deviceRoutes.post('/register', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', parsed.error.flatten().fieldErrors);
  }

  const result = await registerDevice(user.id, parsed.data.platform, parsed.data.token);
  return c.json(success({ registered: true, id: result.id }), 200);
});

/**
 * DELETE /devices/unregister
 * Unregister a device token
 */
deviceRoutes.delete('/unregister', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsed = unregisterSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', parsed.error.flatten().fieldErrors);
  }

  const result = await unregisterDevice(parsed.data.token);
  return c.json(success(result), 200);
});

export { deviceRoutes };
