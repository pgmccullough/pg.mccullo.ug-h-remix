/**
 * Storage for Notes (posts) we receive in our inbox from accounts we follow.
 *
 * Plus a small cache of remote actor profile data so we can render
 * authors' names/avatars without re-fetching their actor docs on every
 * friends-feed render.
 */

import { clientPromise } from "~/lib/mongodb";

// ---------------------------------------------------------------------------
// federation_inbox_posts
// ---------------------------------------------------------------------------

export interface InboxPost {
  noteUri: string;        // canonical AP id of the Note
  authorActorUri: string; // who posted
  content: string;        // HTML
  url?: string;           // human-facing URL on their server
  published: number;      // ms since epoch
  receivedAt: number;     // ms since epoch (when we got it)
  attachments?: Array<{
    type: "Image" | "Video" | "Audio" | "Document";
    url: string;
    mediaType?: string;
  }>;
  // If this is a boost (Announce), the actor who boosted it.
  announcedBy?: string;
  // If this is a reply, the URI of the post being replied to.
  inReplyTo?: string;
  deleted?: boolean;
}

async function inboxPostsCol() {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const c = db.collection<InboxPost>("federation_inbox_posts");
  try {
    await c.createIndex({ noteUri: 1 }, { unique: true });
    await c.createIndex({ published: -1 });
    await c.createIndex({ authorActorUri: 1 });
  } catch {
    /* idempotent */
  }
  return c;
}

export async function storeInboxPost(post: InboxPost): Promise<void> {
  const c = await inboxPostsCol();
  await c.updateOne({ noteUri: post.noteUri }, { $set: post }, { upsert: true });
}

export async function updateInboxPost(
  noteUri: string,
  patch: Partial<InboxPost>
): Promise<void> {
  const c = await inboxPostsCol();
  await c.updateOne({ noteUri }, { $set: patch });
}

export async function softDeleteInboxPost(noteUri: string): Promise<void> {
  const c = await inboxPostsCol();
  await c.updateOne({ noteUri }, { $set: { deleted: true } });
}

export async function getInboxPostsByUris(
  noteUris: string[]
): Promise<Record<string, InboxPost>> {
  if (!noteUris.length) return {};
  const c = await inboxPostsCol();
  const docs = await c
    .find({ noteUri: { $in: noteUris }, deleted: { $ne: true } })
    .toArray();
  const out: Record<string, InboxPost> = {};
  for (const d of docs) out[d.noteUri] = d;
  return out;
}

export async function listInboxPosts(opts: {
  limit?: number;
  beforePublished?: number;
}): Promise<{ items: InboxPost[]; nextCursorMs: number | null }> {
  const limit = opts.limit ?? 25;
  const c = await inboxPostsCol();
  const filter: any = { deleted: { $ne: true } };
  if (opts.beforePublished != null) filter.published = { $lt: opts.beforePublished };
  const items = await c
    .find(filter)
    .sort({ published: -1 })
    .limit(limit + 1)
    .toArray();
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  const nextCursorMs = hasMore ? trimmed[trimmed.length - 1].published : null;
  return { items: trimmed, nextCursorMs };
}

// ---------------------------------------------------------------------------
// federation_remote_actors — small profile cache
// ---------------------------------------------------------------------------

export interface RemoteActorCache {
  actorUri: string;
  handle?: string;         // preferredUsername
  fqHandle?: string;       // @user@host
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;     // human-facing URL of their profile
  updatedAt: number;
}

async function actorsCol() {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const c = db.collection<RemoteActorCache>("federation_remote_actors");
  try {
    await c.createIndex({ actorUri: 1 }, { unique: true });
  } catch {
    /* idempotent */
  }
  return c;
}

export async function cacheRemoteActor(actor: RemoteActorCache): Promise<void> {
  const c = await actorsCol();
  await c.updateOne(
    { actorUri: actor.actorUri },
    { $set: actor },
    { upsert: true }
  );
}

export async function getRemoteActors(
  actorUris: string[]
): Promise<Record<string, RemoteActorCache>> {
  if (!actorUris.length) return {};
  const c = await actorsCol();
  const docs = await c.find({ actorUri: { $in: actorUris } }).toArray();
  const out: Record<string, RemoteActorCache> = {};
  for (const d of docs) out[d.actorUri] = d;
  return out;
}

/**
 * Walk an actor object (Fedify Person/Service/etc.) and pull out the
 * profile fields we care about. Defensive about where the data lives —
 * different implementations expose the icon URL in different ways.
 */
export function extractActorProfile(
  actor: any,
  actorUri: string
): Omit<RemoteActorCache, "updatedAt"> {
  // Avatar — try every place it might live.
  let avatarUrl: string | undefined;
  const iconCandidates: any[] = [actor?.icon, actor?.iconId];
  for (const cand of iconCandidates) {
    if (!cand) continue;
    if (cand instanceof URL) {
      avatarUrl = cand.href;
      break;
    }
    // Image object — url may be URL, string, or array
    const u = cand?.url ?? cand?.urlObject;
    if (u instanceof URL) {
      avatarUrl = u.href;
      break;
    }
    if (typeof u === "string") {
      avatarUrl = u;
      break;
    }
    if (Array.isArray(u) && u.length) {
      const first = u[0];
      avatarUrl = first instanceof URL ? first.href : String(first?.href ?? first);
      break;
    }
  }

  // Profile URL (human-facing).
  let profileUrl: string | undefined;
  const urlCand = actor?.url;
  if (urlCand instanceof URL) profileUrl = urlCand.href;
  else if (typeof urlCand === "string") profileUrl = urlCand;
  else if (urlCand?.href) profileUrl = String(urlCand.href);

  const handle = actor?.preferredUsername?.toString();
  let fqHandle: string | undefined;
  if (handle) {
    try {
      fqHandle = `@${handle}@${new URL(actorUri).host}`;
    } catch {
      /* malformed actorUri — skip */
    }
  }

  return {
    actorUri,
    handle,
    fqHandle,
    displayName: actor?.name?.toString() ?? undefined,
    avatarUrl,
    profileUrl,
  };
}
