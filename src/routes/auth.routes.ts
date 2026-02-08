import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../middleware/validator.js';
import { createUser, storeRefreshToken } from '../services/auth.service.js';
import { hashPassword, validatePasswordStrength } from '../utils/password.js';
import { signAccessToken } from '../utils/jwt.js';
import { ValidationError } from '../utils/errors.js';
import { success } from '../utils/response.js';

const authRoutes = new Hono();

// Zod schema for signup request body
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  display_name: z.string().min(1, 'Display name is required').max(255),
});

// POST /auth/signup - Create a new user account
authRoutes.post('/signup', validateBody(signupSchema), async (c) => {
  const body = await c.req.json();
  const { email, password, display_name } = body;

  // Validate password strength
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.valid) {
    throw new ValidationError('Password does not meet requirements', {
      issues: passwordCheck.errors,
    });
  }

  // Hash the password
  const passwordHash = await hashPassword(password);

  // Create user in database (throws ConflictError if email exists)
  const user = await createUser({
    email,
    displayName: display_name,
    passwordHash,
    authProvider: 'email',
  });

  // Generate access token
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    tier: user.tier,
  });

  // Generate and store refresh token
  const { token: refreshToken } = await storeRefreshToken(user.id);

  return c.json(
    success({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 900,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
        tier: user.tier,
        auth_provider: user.authProvider,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
      },
    }),
    201
  );
});

export { authRoutes };
