import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { validateBody } from '../middleware/validator.js';
import { getProfile, updateProfile, getSettings, updateSettings } from '../services/user.service.js';
import { success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const userRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all user routes
userRoutes.use('*', authMiddleware);

// GET /users/me - Return current user profile
userRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const profile = await getProfile(user.id);

  const userDto = {
    id: profile.id,
    email: profile.email,
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl,
    tier: profile.tier,
    auth_provider: profile.authProvider,
    created_at: profile.createdAt.toISOString(),
    updated_at: profile.updatedAt.toISOString(),
  };

  return c.json(success(userDto), 200);
});

// Zod schema for PUT /users/me
const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  avatar_url: z.string().url().optional(),
});

// PUT /users/me - Update display_name, avatar_url
userRoutes.put('/me', validateBody(updateProfileSchema), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const updated = await updateProfile(user.id, {
    displayName: body.display_name,
    avatarUrl: body.avatar_url,
  });

  const userDto = {
    id: updated.id,
    email: updated.email,
    display_name: updated.displayName,
    avatar_url: updated.avatarUrl,
    tier: updated.tier,
    auth_provider: updated.authProvider,
    created_at: updated.createdAt.toISOString(),
    updated_at: updated.updatedAt.toISOString(),
  };

  return c.json(success(userDto), 200);
});

// GET /users/me/settings - Return user settings JSON
userRoutes.get('/me/settings', async (c) => {
  const user = c.get('user');
  const settings = await getSettings(user.id);

  return c.json(success(settings), 200);
});

// Zod schema for PUT /users/me/settings
const updateSettingsSchema = z.object({}).passthrough();

// PUT /users/me/settings - Merge/update settings JSON
userRoutes.put('/me/settings', validateBody(updateSettingsSchema), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const updated = await updateSettings(user.id, body);

  return c.json(success(updated), 200);
});

export { userRoutes };
