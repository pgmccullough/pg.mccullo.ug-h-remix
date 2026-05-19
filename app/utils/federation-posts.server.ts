/**
 * Helpers for translating local `myPosts` documents into ActivityPub objects.
 *
 * One source of truth for how a post is represented over the wire — used by
 * the outbox dispatcher, the Note object dispatcher, and the on-create
 * delivery path.
 */

import {
  Note,
  Create,
  Update,
  Delete,
  Image as APImage,
  Document,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import type { Context } from "@fedify/fedify";
import { Temporal } from "@js-temporal/polyfill";

import { clientPromise, ObjectId } from "~/lib/mongodb";

const PRIMARY_USERNAME = "patrick";
const DOMAIN = "pg.mccullo.ug";

interface PostDoc {
  _id: any;
  content?: string;
  created?: number; // unix seconds
  lastEdited?: number;
  privacy?: string;
  media?: {
    images?: any;
    videos?: any;
    audio?: any;
    files?: any;
    links?: any;
  };
  inReplyTo?: string;       // AP URI of the post being replied to (if any)
  inReplyToAuthor?: string; // AP URI of that post's author (for delivery)
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function postsCollection() {
  const client = await clientPromise;
  return client.db("user_posts").collection<PostDoc>("myPosts");
}

export async function countPublicPosts(): Promise<number> {
  const col = await postsCollection();
  return col.countDocuments({ privacy: "Public" });
}

export async function findPublicPostById(id: string): Promise<PostDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await postsCollection();
  return col.findOne({ _id: new ObjectId(id), privacy: "Public" });
}

export async function listPublicPosts(opts: {
  limit?: number;
  beforeCreated?: number; // cursor — return posts with created < this
}): Promise<{ items: PostDoc[]; nextCursor: number | null }> {
  const limit = opts.limit ?? 20;
  const col = await postsCollection();
  const filter: any = { privacy: "Public" };
  if (opts.beforeCreated != null) {
    filter.created = { $lt: opts.beforeCreated };
  }
  const items = await col
    .find(filter)
    .sort({ created: -1 })
    .limit(limit + 1)
    .toArray();
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore
    ? trimmed[trimmed.length - 1].created ?? null
    : null;
  return { items: trimmed, nextCursor };
}

// ---------------------------------------------------------------------------
// Post → Note / Create serialization
// ---------------------------------------------------------------------------

const MEDIA_BASE = `https://${DOMAIN}/api/media/`;

/**
 * Build an absolute media URL given the raw item (often just a bare
 * filename like "9ffd63b7-….png") and the kind of media bucket it lives
 * in. The local UI hardcodes paths like /api/media/images/<filename> in
 * its <Image> component, so the data layer never sees the "images/"
 * prefix; we need to add it here for federation.
 */
function mediaItemToDocument(
  item: any,
  kindPath: "images" | "videos" | "audio" | "files"
): Document | APImage | null {
  // Items can be strings (URLs) or objects with url + meta. Be defensive —
  // post history spans years of schema drift.
  const url =
    typeof item === "string"
      ? item
      : item?.url || item?.file || item?.src;
  if (typeof url !== "string" || !url.length) return null;

  // Normalize to absolute URL.
  let absolute = url.trim();
  if (absolute.startsWith("/")) {
    absolute = `https://${DOMAIN}${absolute}`;
  } else if (!/^https?:\/\//.test(absolute)) {
    // Bare filename — prepend the bucket path the local UI uses.
    absolute = `${MEDIA_BASE}${kindPath}/${absolute}`;
  }

  // Guard against the URL constructor throwing on garbage data.
  try {
    new URL(absolute);
  } catch {
    return null;
  }

  // Crude media-type detection from extension.
  const ext = absolute.split(".").pop()?.toLowerCase() ?? "";
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "avif"];
  const videoExts = ["mp4", "mov", "webm", "m4v"];
  const audioExts = ["mp3", "ogg", "m4a", "wav"];

  if (imageExts.includes(ext)) {
    return new APImage({
      url: new URL(absolute),
      mediaType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    });
  }
  if (videoExts.includes(ext)) {
    return new Document({
      url: new URL(absolute),
      mediaType: `video/${ext}`,
    });
  }
  if (audioExts.includes(ext)) {
    return new Document({
      url: new URL(absolute),
      mediaType: `audio/${ext}`,
    });
  }
  // Fallback: opaque attachment.
  return new Document({ url: new URL(absolute) });
}

function collectAttachments(post: PostDoc): (Document | APImage)[] {
  const out: (Document | APImage)[] = [];
  const media = post.media ?? {};
  for (const key of ["images", "videos", "audio", "files"] as const) {
    const arr = media[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const doc = mediaItemToDocument(item, key);
      if (doc) out.push(doc);
    }
  }
  return out;
}

/**
 * Build the canonical Note for a given post. `ctx` is needed so URLs are
 * derived from the current federation context (cleaner than hardcoding).
 */
export function postToNote(post: PostDoc, ctx: Context<void>): Note {
  const id = String(post._id);
  const actorUri = ctx.getActorUri(PRIMARY_USERNAME);
  const followersUri = ctx.getFollowersUri(PRIMARY_USERNAME);
  const noteUri = new URL(`${actorUri.href}/posts/${id}`);

  // post.created is unix seconds; Fedify wants Temporal.Instant.
  // Guard against missing/garbage created timestamps in old posts.
  let published: Temporal.Instant | undefined;
  if (typeof post.created === "number" && Number.isFinite(post.created)) {
    try {
      published = Temporal.Instant.fromEpochMilliseconds(post.created * 1000);
    } catch {
      published = undefined;
    }
  }

  const attachments = collectAttachments(post);

  // Note in Fedify accepts both `attribution` (the actor object or URL)
  // and `attributions` (array). `attachment` / `attachments` similarly.
  // We use the canonical singular/plural that Fedify expects in the ctor:
  // see https://fedify.dev for the model.
  return new Note({
    id: noteUri,
    url: new URL(`https://${DOMAIN}/h/post/${id}`),
    attribution: actorUri,
    to: PUBLIC_COLLECTION,
    cc: followersUri,
    published,
    // post.content is HTML written via Lexical. We trust ourselves since
    // we're the only poster. Mastodon renders this as HTML.
    content: post.content ?? "",
    attachments: attachments.length ? attachments : undefined,
    // Threading: link to the post we're replying to (if any).
    replyTarget: post.inReplyTo ? new URL(post.inReplyTo) : undefined,
  });
}

export function postToCreate(post: PostDoc, ctx: Context<void>): Create {
  const note = postToNote(post, ctx);
  const id = String(post._id);
  const actorUri = ctx.getActorUri(PRIMARY_USERNAME);
  const followersUri = ctx.getFollowersUri(PRIMARY_USERNAME);
  // Activity id distinct from note id — convention is to append #create or
  // /activity.
  return new Create({
    id: new URL(`${actorUri.href}/posts/${id}#create`),
    actor: actorUri,
    object: note,
    to: PUBLIC_COLLECTION,
    cc: followersUri,
    published: note.published ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Delivery: push a new post out to all followers (fire-and-forget)
// ---------------------------------------------------------------------------
//
// Called from /api/post/create after the insertOne. We don't await this in
// the API handler — that would block the POST response on every follower's
// inbox responding, and on Vercel's 60s budget that's a risk. We log
// failures but don't surface them to the caller. A3-durable will replace
// this with a Mongo queue + cron worker.

import type { MongoClient } from "mongodb";

export async function federatePostToFollowers(args: {
  client: MongoClient;
  origin: string; // e.g., "https://pg.mccullo.ug"
  postId: string;
}): Promise<{ attempted: number; succeeded: number; failed: number }> {
  // Late-import the federation singleton so we avoid an import cycle.
  // (federation.server.ts imports from this file via postToNote/postToCreate.)
  const { federation } = await import("~/utils/federation.server");

  // Look up the post fresh — guards against the caller passing a stale doc.
  const post = await findPublicPostById(args.postId);
  if (!post) {
    console.warn(`[federation] federatePostToFollowers: post ${args.postId} not Public or not found`);
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  // Create a background context (not tied to an incoming request).
  const ctx = federation.createContext(new URL(args.origin), undefined);
  const activity = postToCreate(post, ctx);

  // Enumerate followers from Mongo and send to each.
  const db = args.client.db("user_posts");
  const followers = await db
    .collection("federation_followers")
    .find({ handle: PRIMARY_USERNAME })
    .toArray();

  if (followers.length === 0) {
    console.log(`[federation] no followers to deliver post ${args.postId} to`);
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  console.log(
    `[federation] delivering post ${args.postId} to ${followers.length} follower(s)`
  );

  // Fan out. Promise.allSettled so one slow follower doesn't tank the rest.
  const results = await Promise.allSettled(
    followers.map((f) =>
      ctx.sendActivity(
        { identifier: PRIMARY_USERNAME },
        {
          id: new URL(f.actorUri),
          inboxId: new URL(f.inboxUri),
          endpoints: f.sharedInboxUri
            ? { sharedInbox: new URL(f.sharedInboxUri) }
            : null,
        },
        activity
      )
    )
  );

  let succeeded = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      succeeded++;
    } else {
      failed++;
      console.error(
        `[federation] delivery to ${followers[i].actorUri} failed:`,
        r.reason
      );
    }
  });

  console.log(
    `[federation] post ${args.postId}: ${succeeded} ok, ${failed} failed`
  );
  return { attempted: followers.length, succeeded, failed };
}

// ---------------------------------------------------------------------------
// Update + Delete delivery
// ---------------------------------------------------------------------------

async function listFollowerRecipients(client: MongoClient): Promise<
  Array<{
    id: URL;
    inboxId: URL;
    endpoints: { sharedInbox: URL } | null;
  }>
> {
  const db = client.db("user_posts");
  const followers = await db
    .collection("federation_followers")
    .find({ handle: PRIMARY_USERNAME })
    .toArray();
  return followers.map((f) => ({
    id: new URL(f.actorUri),
    inboxId: new URL(f.inboxUri),
    endpoints: f.sharedInboxUri
      ? { sharedInbox: new URL(f.sharedInboxUri) }
      : null,
  }));
}

async function fanout(
  ctx: Context<void>,
  recipients: Array<{ id: URL; inboxId: URL; endpoints: any }>,
  activity: any,
  label: string
): Promise<{ succeeded: number; failed: number }> {
  if (recipients.length === 0) {
    console.log(`[federation] no followers for ${label}`);
    return { succeeded: 0, failed: 0 };
  }
  const results = await Promise.allSettled(
    recipients.map((r) =>
      ctx.sendActivity({ identifier: PRIMARY_USERNAME }, r, activity)
    )
  );
  let succeeded = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") succeeded++;
    else {
      failed++;
      console.error(
        `[federation] ${label} → ${recipients[i].id.href} failed:`,
        r.reason
      );
    }
  });
  console.log(`[federation] ${label}: ${succeeded} ok, ${failed} failed`);
  return { succeeded, failed };
}

/**
 * Notify followers that a Public post has been edited. The Update wraps
 * the entire updated Note; receivers replace their cached copy. No-op if
 * the post isn't currently Public.
 */
export async function federatePostUpdate(args: {
  client: MongoClient;
  origin: string;
  postId: string;
}) {
  const { federation } = await import("~/utils/federation.server");
  const post = await findPublicPostById(args.postId);
  if (!post) {
    console.log(
      `[federation] update: post ${args.postId} not Public, skipping`
    );
    return;
  }
  const ctx = federation.createContext(new URL(args.origin), undefined);
  const actorUri = ctx.getActorUri(PRIMARY_USERNAME);
  const note = postToNote(post, ctx);
  const update = new Update({
    id: new URL(`${actorUri.href}/posts/${args.postId}#update-${Date.now()}`),
    actor: actorUri,
    object: note,
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(PRIMARY_USERNAME),
  });
  const recipients = await listFollowerRecipients(args.client);
  await fanout(ctx, recipients, update, `update post ${args.postId}`);
}

/**
 * Tell followers a post has been removed. Standard ActivityPub pattern is
 * a Delete activity whose `object` is the Note's URI. The receivers turn
 * it into a Tombstone locally.
 */
export async function federatePostDelete(args: {
  client: MongoClient;
  origin: string;
  postId: string;
}) {
  const { federation } = await import("~/utils/federation.server");
  const ctx = federation.createContext(new URL(args.origin), undefined);
  const actorUri = ctx.getActorUri(PRIMARY_USERNAME);
  const noteUri = new URL(`${actorUri.href}/posts/${args.postId}`);
  const del = new Delete({
    id: new URL(`${actorUri.href}/posts/${args.postId}#delete-${Date.now()}`),
    actor: actorUri,
    object: noteUri,
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(PRIMARY_USERNAME),
  });
  const recipients = await listFollowerRecipients(args.client);
  await fanout(ctx, recipients, del, `delete post ${args.postId}`);
}
