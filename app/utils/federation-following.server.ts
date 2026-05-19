/**
 * Outgoing follow infrastructure.
 *
 * Stores the accounts WE follow (vs federation_followers, which stores
 * accounts that follow US). Tracks the lifecycle:
 *
 *   pending  — Follow sent, waiting for Accept/Reject
 *   accepted — they accepted; we should receive their posts
 *   rejected — they declined; no further action
 *
 * When a Follow we sent is accepted (we receive Accept(Follow) in our
 * inbox), `markAccepted` flips the status. If rejected, `markRejected`.
 */

import { clientPromise } from "~/lib/mongodb";

export type FollowingStatus = "pending" | "accepted" | "rejected";

export interface FollowingRecord {
  handle: string;       // our local handle ("patrick")
  actorUri: string;     // the remote actor we're following
  inboxUri?: string;    // their inbox (cached at follow time)
  sharedInboxUri?: string;
  status: FollowingStatus;
  requestedAt: number;
  acceptedAt?: number;
  rejectedAt?: number;
  // Round-trip the Follow activity id we generated so we can correlate
  // Accept/Reject responses back to this record.
  followActivityId?: string;
}

async function col() {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const c = db.collection<FollowingRecord>("federation_following");
  try {
    await c.createIndex({ handle: 1, actorUri: 1 }, { unique: true });
    await c.createIndex({ followActivityId: 1 });
  } catch {
    /* idempotent */
  }
  return c;
}

export async function recordPendingFollow(record: {
  handle: string;
  actorUri: string;
  inboxUri?: string;
  sharedInboxUri?: string;
  followActivityId: string;
}): Promise<void> {
  const c = await col();
  await c.updateOne(
    { handle: record.handle, actorUri: record.actorUri },
    {
      $set: {
        ...record,
        status: "pending",
        requestedAt: Date.now(),
      },
    },
    { upsert: true }
  );
}

export async function markAcceptedByActor(
  handle: string,
  actorUri: string
): Promise<void> {
  const c = await col();
  await c.updateOne(
    { handle, actorUri },
    { $set: { status: "accepted", acceptedAt: Date.now() } }
  );
}

export async function markRejectedByActor(
  handle: string,
  actorUri: string
): Promise<void> {
  const c = await col();
  await c.updateOne(
    { handle, actorUri },
    { $set: { status: "rejected", rejectedAt: Date.now() } }
  );
}

export async function removeFollowing(
  handle: string,
  actorUri: string
): Promise<void> {
  const c = await col();
  await c.deleteOne({ handle, actorUri });
}

export async function countFollowing(handle: string): Promise<number> {
  const c = await col();
  return c.countDocuments({ handle, status: "accepted" });
}

export async function listFollowing(
  handle: string,
  opts: { limit?: number; cursorMs?: number; status?: FollowingStatus } = {}
): Promise<{ items: FollowingRecord[]; nextCursorMs: number | null }> {
  const limit = opts.limit ?? 50;
  const c = await col();
  const filter: any = { handle };
  if (opts.status) filter.status = opts.status;
  if (opts.cursorMs != null) filter.requestedAt = { $lt: opts.cursorMs };
  const items = await c
    .find(filter)
    .sort({ requestedAt: -1 })
    .limit(limit + 1)
    .toArray();
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  const nextCursorMs = hasMore
    ? trimmed[trimmed.length - 1].requestedAt
    : null;
  return { items: trimmed, nextCursorMs };
}

export async function findFollowingByActor(
  handle: string,
  actorUri: string
): Promise<FollowingRecord | null> {
  const c = await col();
  return c.findOne({ handle, actorUri });
}
