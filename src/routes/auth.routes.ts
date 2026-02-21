import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../middleware/validator.js';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';
import { authRateLimitMiddleware } from '../middleware/rate-limit.js';
import {
  createUser,
  findByEmail,
  findById,
  storeRefreshToken,
  findAndVerifyRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  updatePasswordHash,
  verifyGoogleToken,
  verifyAppleToken,
  upsertOAuthUser,
} from '../services/auth.service.js';
import { hashPassword, comparePassword, validatePasswordStrength } from '../utils/password.js';
import { signAccessToken, signResetToken, verifyResetToken } from '../utils/jwt.js';
import { sendPasswordResetEmail } from '../services/email.service.js';
import { AuthInvalidCredentialsError, ValidationError, NotFoundError } from '../utils/errors.js';
import { success } from '../utils/response.js';

const authRoutes = new Hono();

// Apply auth-specific rate limiting to all auth routes
authRoutes.use('*', authRateLimitMiddleware);

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

// Zod schema for refresh token request body
const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

// POST /auth/refresh - Refresh access token using a valid refresh token
authRoutes.post('/refresh', validateBody(refreshSchema), async (c) => {
  const body = await c.req.json();
  const { refresh_token } = body;

  // Find and verify the refresh token (searches all non-revoked, non-expired tokens)
  const result = await findAndVerifyRefreshToken(refresh_token);
  if (!result) {
    throw new AuthInvalidCredentialsError('Invalid or expired refresh token');
  }

  const { tokenRow, userId } = result;

  // Revoke the old refresh token (token rotation)
  await revokeRefreshToken(tokenRow.id);

  // Look up the user to get current profile data
  const user = await findById(userId);
  if (!user) {
    throw new AuthInvalidCredentialsError('User not found');
  }

  // Generate new access token
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    tier: user.tier,
  });

  // Generate and store new refresh token
  const { token: newRefreshToken } = await storeRefreshToken(user.id);

  return c.json(
    success({
      access_token: accessToken,
      refresh_token: newRefreshToken,
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

// Zod schema for logout request body
const logoutSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

// POST /auth/logout - Revoke a refresh token (requires authentication)
authRoutes.post('/logout', authMiddleware, validateBody(logoutSchema), async (c) => {
  const body = await c.req.json();
  const { refresh_token } = body;

  // Find and verify the refresh token
  const result = await findAndVerifyRefreshToken(refresh_token);
  if (result) {
    // Revoke the refresh token
    await revokeRefreshToken(result.tokenRow.id);
  }

  // Return success regardless of whether the token was found
  // (prevents token enumeration attacks)
  return c.json(success(null), 200);
});

// --- Password Reset & Change ---

// Zod schema for forgot password request body
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// POST /auth/forgot-password - Send a password reset email
authRoutes.post('/forgot-password', validateBody(forgotPasswordSchema), async (c) => {
  const body = await c.req.json();
  const { email } = body;

  // Always return success to prevent email enumeration
  const user = await findByEmail(email);

  if (user && user.passwordHash) {
    // Only send reset email for users who have a password (not OAuth-only)
    const resetToken = signResetToken({ sub: user.id, email: user.email });

    try {
      await sendPasswordResetEmail(user.email, resetToken);
    } catch (err) {
      console.error('Failed to send reset email:', err);
      // Don't expose email delivery failures to the client
    }
  }

  return c.json(
    success({ message: 'If an account with that email exists, a password reset link has been sent.' }),
    200
  );
});

// Zod schema for reset password request body
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(1, 'New password is required'),
});

// POST /auth/reset-password - Reset password using a token from the email link
authRoutes.post('/reset-password', validateBody(resetPasswordSchema), async (c) => {
  const body = await c.req.json();
  const { token, password } = body;

  // Verify the reset token
  let payload;
  try {
    payload = verifyResetToken(token);
  } catch {
    throw new AuthInvalidCredentialsError('Invalid or expired reset link. Please request a new one.');
  }

  // Validate new password strength
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.valid) {
    throw new ValidationError('Password does not meet requirements', {
      issues: passwordCheck.errors,
    });
  }

  // Verify user still exists
  const user = await findById(payload.sub);
  if (!user) {
    throw new AuthInvalidCredentialsError('Invalid or expired reset link.');
  }

  // Update the password
  const newHash = await hashPassword(password);
  await updatePasswordHash(user.id, newHash);

  // Revoke all existing refresh tokens (force re-login everywhere)
  await revokeAllRefreshTokens(user.id);

  return c.json(
    success({ message: 'Password has been reset successfully. Please sign in with your new password.' }),
    200
  );
});

// Zod schema for change password request body
const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(1, 'New password is required'),
});

// POST /auth/change-password - Change password for an authenticated user
authRoutes.post('/change-password', authMiddleware, validateBody(changePasswordSchema), async (c) => {
  const body = await c.req.json();
  const { current_password, new_password } = body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authUser = (c as any).get('user') as AuthUser;

  // Get full user record
  const user = await findById(authUser.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Ensure user has a password (not OAuth-only)
  if (!user.passwordHash) {
    throw new ValidationError('Cannot change password for accounts created via Google or Apple sign-in.');
  }

  // Verify current password
  const isValid = await comparePassword(current_password, user.passwordHash);
  if (!isValid) {
    throw new AuthInvalidCredentialsError('Current password is incorrect');
  }

  // Validate new password strength
  const passwordCheck = validatePasswordStrength(new_password);
  if (!passwordCheck.valid) {
    throw new ValidationError('New password does not meet requirements', {
      issues: passwordCheck.errors,
    });
  }

  // Prevent reuse of the same password
  const samePassword = await comparePassword(new_password, user.passwordHash);
  if (samePassword) {
    throw new ValidationError('New password must be different from current password');
  }

  // Update the password
  const newHash = await hashPassword(new_password);
  await updatePasswordHash(user.id, newHash);

  return c.json(
    success({ message: 'Password changed successfully.' }),
    200
  );
});

export { authRoutes };
