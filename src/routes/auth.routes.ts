import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../middleware/validator.js';
import {
  createUser,
  findByEmail,
  storeRefreshToken,
  verifyGoogleToken,
  verifyAppleToken,
  upsertOAuthUser,
} from '../services/auth.service.js';
import { hashPassword, comparePassword, validatePasswordStrength } from '../utils/password.js';
import { signAccessToken } from '../utils/jwt.js';
import { AuthInvalidCredentialsError, ValidationError } from '../utils/errors.js';
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

// Zod schema for login request body
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// POST /auth/login - Authenticate with email and password
authRoutes.post('/login', validateBody(loginSchema), async (c) => {
  const body = await c.req.json();
  const { email, password } = body;

  // Find user by email
  const user = await findByEmail(email);
  if (!user) {
    throw new AuthInvalidCredentialsError('Invalid email or password');
  }

  // Verify user has a password (not an OAuth-only account)
  if (!user.passwordHash) {
    throw new AuthInvalidCredentialsError('Invalid email or password');
  }

  // Compare password with stored hash
  const passwordValid = await comparePassword(password, user.passwordHash);
  if (!passwordValid) {
    throw new AuthInvalidCredentialsError('Invalid email or password');
  }

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
    200
  );
});

// Zod schema for Google OAuth request body
const googleSchema = z.object({
  id_token: z.string().min(1, 'Google ID token is required'),
});

// POST /auth/google - Authenticate with Google OAuth
authRoutes.post('/google', validateBody(googleSchema), async (c) => {
  const body = await c.req.json();
  const { id_token } = body;

  // Verify the Google ID token
  const tokenInfo = await verifyGoogleToken(id_token);

  // Upsert user (create if new, update if existing)
  const user = await upsertOAuthUser({
    provider: 'google',
    providerId: tokenInfo.sub,
    email: tokenInfo.email,
    displayName: tokenInfo.name || tokenInfo.email.split('@')[0],
    avatarUrl: tokenInfo.picture,
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
    200
  );
});

// Zod schema for Apple Sign In request body
const appleSchema = z.object({
  identity_token: z.string().min(1, 'Apple identity token is required'),
  authorization_code: z.string().min(1, 'Apple authorization code is required'),
  user: z
    .object({
      email: z.string().email().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

// POST /auth/apple - Authenticate with Apple Sign In
authRoutes.post('/apple', validateBody(appleSchema), async (c) => {
  const body = await c.req.json();
  const { identity_token, user: appleUser } = body;

  // Verify the Apple identity token (fetches JWKS, validates signature + claims)
  const tokenClaims = await verifyAppleToken(identity_token);

  // Determine email: prefer token claims, fall back to user object from first sign-in
  const email = tokenClaims.email || appleUser?.email;
  if (!email) {
    throw new ValidationError('Email is required but not provided by Apple token or user object');
  }

  // Determine display name: Apple only sends name on first sign-in
  const displayName = appleUser?.name || email.split('@')[0];

  // Upsert user (create if new, update if existing)
  const user = await upsertOAuthUser({
    provider: 'apple',
    providerId: tokenClaims.sub,
    email,
    displayName,
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
    200
  );
});

export { authRoutes };
