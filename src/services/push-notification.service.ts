import { getActiveTokensForUser, markTokenInactive } from './device-token.service.js';

/**
 * Push Notification Service using Firebase Cloud Messaging (FCM).
 *
 * Lazily initializes the Firebase Admin SDK on first use.
 * Gracefully degrades when Firebase credentials are not configured.
 */

let firebaseApp: any = null;
let messaging: any = null;
let initialized = false;

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Lazily initialize Firebase Admin SDK.
 * Returns false if credentials are not configured.
 */
async function initializeFirebase(): Promise<boolean> {
  if (initialized) return messaging !== null;

  initialized = true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Firebase credentials not configured — push notifications disabled');
    return false;
  }

  try {
    const admin = await import('firebase-admin');

    firebaseApp = admin.default.initializeApp({
      credential: admin.default.credential.cert({
        projectId,
        clientEmail,
        // Private key comes as escaped string from env vars
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });

    messaging = admin.default.messaging();
    console.log('Firebase Admin SDK initialized for push notifications');
    return true;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    return false;
  }
}

/**
 * Send a push notification to a single device token.
 */
export async function sendToDevice(token: string, payload: PushPayload): Promise<boolean> {
  const ready = await initializeFirebase();
  if (!ready) return false;

  try {
    await messaging.send({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
      // Platform-specific config
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'vettr_alerts',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      webpush: {
        notification: {
          icon: '/favicon.svg',
        },
      },
    });
    return true;
  } catch (error: any) {
    // Handle stale/invalid tokens
    if (
      error?.code === 'messaging/registration-token-not-registered' ||
      error?.code === 'messaging/invalid-registration-token'
    ) {
      await markTokenInactive(token);
      console.warn(`Stale FCM token removed: ${token.substring(0, 20)}...`);
    } else {
      console.error('FCM send error:', error);
    }
    return false;
  }
}

/**
 * Send a push notification to all active devices for a user.
 */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  const ready = await initializeFirebase();
  if (!ready) return 0;

  const tokens = await getActiveTokensForUser(userId);
  if (tokens.length === 0) return 0;

  let sent = 0;
  for (const { token } of tokens) {
    const success = await sendToDevice(token, payload);
    if (success) sent++;
  }

  return sent;
}

/**
 * Send a push notification to multiple users (batch).
 * Used by cron jobs for bulk alert delivery.
 */
export async function sendBatch(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const ready = await initializeFirebase();
  if (!ready) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const count = await sendToUser(userId, payload);
      if (count > 0) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}
