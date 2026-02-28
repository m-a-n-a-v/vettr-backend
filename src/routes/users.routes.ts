import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { validateBody } from '../middleware/validator.js';
import { getProfile, updateProfile, getSettings, updateSettings, deleteUserAccount, exportUserData, acceptTerms } from '../services/user.service.js';
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
    tos_accepted_at: profile.tosAcceptedAt?.toISOString() ?? null,
    privacy_accepted_at: profile.privacyAcceptedAt?.toISOString() ?? null,
    tos_version: profile.tosVersion ?? null,
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

  // Sanitise free-text field — strip HTML tags and control characters
  const sanitise = (s?: string) =>
    s?.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();

  const updated = await updateProfile(user.id, {
    displayName: sanitise(body.display_name),
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

// DELETE /users/me - Soft-delete user account and anonymise PII (GDPR Art. 17 / App Store 4.7)
userRoutes.delete('/me', async (c) => {
  const user = c.get('user');
  await deleteUserAccount(user.id);
  return c.body(null, 204);
});

// Zod schema for POST /users/me/accept-terms
const acceptTermsSchema = z.object({
  tos_version: z.string().min(1).max(20),
  accept_tos: z.boolean(),
  accept_privacy: z.boolean(),
});

// POST /users/me/accept-terms - Record ToS/Privacy consent (CASL, PIPEDA, App Store 3.1.1)
userRoutes.post('/me/accept-terms', validateBody(acceptTermsSchema), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  await acceptTerms(user.id, body);
  return c.json(success({ accepted: true }), 200);
});

// GET /users/me/data-export - Export all user data as JSON (GDPR Art. 15 / Art. 20)
userRoutes.get('/me/data-export', async (c) => {
  const user = c.get('user');
  const data = await exportUserData(user.id);

  c.header('Content-Type', 'application/json');
  c.header('Content-Disposition', 'attachment; filename="vettr-data-export.json"');
  return c.json(data, 200);
});

export { userRoutes };
