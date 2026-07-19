/**
 * Web Push helpers — send notifications to browsers that have
 * subscribed via /api/push/subscribe.
 *
 * VAPID keys are set once via env vars:
 *   VAPID_PUBLIC_KEY   — safe to share; the client uses it to subscribe
 *   VAPID_PRIVATE_KEY  — server-only; signs outgoing pushes
 *   VAPID_SUBJECT      — a mailto: or https:// URL identifying the site
 *
 * The `web-push` library handles all the encryption + auth per
 * spec. If any env var is missing, sending is a no-op.
 *
 * Subscriptions are persisted in the `pushSubscriptions` Mongo
 * collection keyed by `endpoint`, which is unique per browser/device.
 * Send returns per-recipient results; endpoints that respond with
 * 404/410 (subscription expired) are pruned automatically.
 */

import { clientPromise } from "~/lib/mongodb";

export interface PushPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId?: string;
  createdAt?: number;
}

function loadWebPushLazy(): Promise<typeof import("web-push")> {
  // Dynamic import so a missing dep at build time can't take down SSR.
  return import("web-push");
}

async function collection() {
  const client = await clientPromise;
  return client.db("user_posts").collection<StoredSubscription>("pushSubscriptions");
}

export async function saveSubscription(sub: StoredSubscription): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { endpoint: sub.endpoint },
    {
      $set: {
        endpoint: sub.endpoint,
        keys: sub.keys,
        userId: sub.userId,
      },
      $setOnInsert: { createdAt: Date.now() },
    },
    { upsert: true }
  );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const col = await collection();
  await col.deleteOne({ endpoint });
}

export function pushConfigured(): boolean {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

/**
 * Send a payload to every stored subscription. Prunes subscriptions
 * that reply 404/410 (the browser has revoked or expired them).
 * Returns { attempted, delivered, pruned } for observability.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{
  attempted: number;
  delivered: number;
  pruned: number;
}> {
  if (!pushConfigured()) return { attempted: 0, delivered: 0, pruned: 0 };

  const col = await collection();
  const subs = await col.find().toArray();
  if (subs.length === 0) return { attempted: 0, delivered: 0, pruned: 0 };

  const webpush = await loadWebPushLazy();
  webpush.default.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const body = JSON.stringify(payload);
  let delivered = 0;
  let pruned = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.default.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body,
          { TTL: 60 * 60 } // give push service an hour to deliver
        );
        delivered++;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription is dead — remove it.
          await col.deleteOne({ endpoint: sub.endpoint }).catch(() => {});
          pruned++;
        } else {
          console.error(`[web-push] send failed (${status}):`, err?.body ?? err);
        }
      }
    })
  );

  return { attempted: subs.length, delivered, pruned };
}
