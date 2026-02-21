import { Resend } from 'resend';
import { env } from '../config/env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const FROM_EMAIL = 'VETTR <noreply@vettr.app>';
// Fallback for when no custom domain is set up yet
const FROM_EMAIL_FALLBACK = 'VETTR <onboarding@resend.dev>';

/**
 * Send a password reset email with a tokenised link.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
): Promise<void> {
  const resetUrl = `${env.APP_URL}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 28px; font-weight: bold; color: #0f172a; margin: 0;">
          <span style="color: #00E676;">V</span>ETTR
        </h1>
      </div>

      <h2 style="font-size: 20px; font-weight: 600; color: #0f172a; margin: 0 0 16px;">
        Reset Your Password
      </h2>

      <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 24px;">
        We received a request to reset your password. Click the button below to create a new password. This link will expire in 1 hour.
      </p>

      <a href="${resetUrl}" style="display: inline-block; background-color: #00E676; color: #0f172a; font-weight: 600; font-size: 14px; padding: 12px 32px; border-radius: 12px; text-decoration: none;">
        Reset Password
      </a>

      <p style="font-size: 12px; color: #94a3b8; line-height: 1.6; margin: 24px 0 0;">
        If you didn&rsquo;t request this, you can safely ignore this email. Your password won&rsquo;t be changed.
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;" />

      <p style="font-size: 11px; color: #cbd5e1; margin: 0;">
        If the button doesn&rsquo;t work, copy and paste this link:<br />
        <a href="${resetUrl}" style="color: #94a3b8; word-break: break-all;">${resetUrl}</a>
      </p>
    </div>
  `;

  if (!resend) {
    // In development without Resend key, log the reset URL
    console.log(`[DEV] Password reset link for ${to}: ${resetUrl}`);
    return;
  }

  const from = env.RESEND_API_KEY?.startsWith('re_')
    ? FROM_EMAIL_FALLBACK  // Use Resend test domain until custom domain is verified
    : FROM_EMAIL;

  const { error } = await resend.emails.send({
    from,
    to,
    subject: 'Reset your VETTR password',
    html,
  });

  if (error) {
    console.error('Failed to send password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
}
