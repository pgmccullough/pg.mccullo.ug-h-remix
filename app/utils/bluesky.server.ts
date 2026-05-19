/**
 * Bluesky client wrapper.
 *
 * We're not implementing AT Protocol — we're just acting as a logged-in
 * Bluesky client (cross-poster) using the official @atproto/api library.
 *
 * Auth: app password via env vars (BLUESKY_IDENTIFIER + BLUESKY_APP_PASSWORD).
 * Skipped silently if either is missing — that's the "Bluesky is just
 * disabled" case and the rest of the site keeps working normally.
 *
 * Session caching: the agent's session token lasts about 2 hours. We
 * keep one BskyAgent on globalThis so warm serverless invocations
 * re-use it; cold starts get a fresh login. If a call comes back with a
 * 401/expired-token error we re-login once and retry.
 */

import { BskyAgent, RichText } from "@atproto/api";

declare global {
  // eslint-disable-next-line no-var
  var __blueskyAgent: BskyAgent | undefined;
}

function envCreds(): { identifier: string; password: string } | null {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;
  return { identifier, password };
}

async function getAgent(): Promise<BskyAgent | null> {
  const creds = envCreds();
  if (!creds) return null;
  if (globalThis.__blueskyAgent) return globalThis.__blueskyAgent;
  const agent = new BskyAgent({ service: "https://bsky.social" });
  try {
    await agent.login({
      identifier: creds.identifier,
      password: creds.password,
    });
  } catch (err) {
    console.error("[bluesky] login failed:", err);
    return null;
  }
  globalThis.__blueskyAgent = agent;
  return agent;
}

/**
 * Retry wrapper — if a call fails with a session/auth error, reset the
 * cached agent, try once more with a fresh login.
 */
async function withRetry<T>(fn: (agent: BskyAgent) => Promise<T>): Promise<T | null> {
  let agent = await getAgent();
  if (!agent) return null;
  try {
    return await fn(agent);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (/auth|token|session|401/i.test(msg)) {
      console.warn("[bluesky] auth error; retrying with fresh session");
      globalThis.__blueskyAgent = undefined;
      agent = await getAgent();
      if (!agent) return null;
      try {
        return await fn(agent);
      } catch (err2) {
        console.error("[bluesky] retry failed:", err2);
        return null;
      }
    }
    console.error("[bluesky] request failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outbound: post
// ---------------------------------------------------------------------------

const POST_CHAR_LIMIT = 300; // Bluesky's text limit
const MAX_IMAGES = 4;

export interface BlueskyPostResult {
  uri: string;   // at://did/app.bsky.feed.post/<rkey>
  cid: string;
}

export async function postToBluesky(args: {
  /** Site URL of the original post, used as a "Read more →" suffix when truncated. */
  permalinkUrl?: string;
  /** Plain text (or HTML — we'll strip). */
  text: string;
  /** Absolute URLs of images to attach (up to 4). */
  imageUrls?: string[];
}): Promise<BlueskyPostResult | null> {
  return withRetry(async (agent) => {
    let plain = stripHtml(args.text).trim();
    if (!plain && (!args.imageUrls || args.imageUrls.length === 0)) {
      console.warn("[bluesky] skipping empty post");
      return null;
    }

    // Truncate, leaving room for a "… <permalink>" suffix if the source
    // post overflows the 300-char limit.
    let suffix = "";
    if (args.permalinkUrl && plain.length > POST_CHAR_LIMIT - 30) {
      suffix = `\n\n${args.permalinkUrl}`;
      const room = POST_CHAR_LIMIT - suffix.length - 1;
      if (plain.length > room) {
        plain = plain.slice(0, room - 1).trimEnd() + "…";
      }
    } else if (plain.length > POST_CHAR_LIMIT) {
      plain = plain.slice(0, POST_CHAR_LIMIT - 1).trimEnd() + "…";
    }
    const text = plain + suffix;

    // RichText parses links/mentions into facets for proper rendering.
    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    // Upload images, if any, up to the limit. Each upload returns a blob
    // ref we then embed in the post.
    const images = (args.imageUrls ?? []).slice(0, MAX_IMAGES);
    const embed: any = images.length
      ? { $type: "app.bsky.embed.images", images: [] as any[] }
      : undefined;
    for (const url of images) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        const blob = new Uint8Array(await res.arrayBuffer());
        const uploaded = await agent.uploadBlob(blob, { encoding: contentType });
        embed.images.push({
          alt: "",
          image: uploaded.data.blob,
        });
      } catch (err) {
        console.error(`[bluesky] image upload failed for ${url}:`, err);
      }
    }

    const result = await agent.post({
      text: rt.text,
      facets: rt.facets,
      embed,
    });
    return { uri: result.uri, cid: result.cid };
  });
}

// ---------------------------------------------------------------------------
// Outbound: delete
// ---------------------------------------------------------------------------

export async function deleteBlueskyPost(atUri: string): Promise<boolean> {
  const result = await withRetry(async (agent) => {
    await agent.deletePost(atUri);
    return true;
  });
  return result === true;
}

// ---------------------------------------------------------------------------
// Inbound: timeline
// ---------------------------------------------------------------------------

export interface BlueskyFeedPost {
  uri: string;
  cid: string;
  text: string;
  authorDid: string;
  authorHandle: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  publishedMs: number;
  webUrl: string;
  images: Array<{ url: string; alt: string }>;
}

export async function fetchBlueskyTimeline(opts: { limit?: number } = {}): Promise<
  BlueskyFeedPost[]
> {
  const result = await withRetry(async (agent) => {
    const res = await agent.getTimeline({ limit: opts.limit ?? 25 });
    const posts: BlueskyFeedPost[] = [];
    for (const item of res.data.feed) {
      const p = item.post;
      const record: any = p.record;
      // Skip reposts/replies-of-others for now — keep the feed simple.
      // (Reposts have reasonByRepost; we could surface them later.)
      const author = p.author;
      const handle = author.handle;
      const webUrl = `https://bsky.app/profile/${handle}/post/${atUriToRkey(
        p.uri
      )}`;
      const images: BlueskyFeedPost["images"] = [];
      const embed: any = p.embed;
      if (embed?.$type === "app.bsky.embed.images#view" && embed.images) {
        for (const img of embed.images) {
          images.push({ url: img.fullsize ?? img.thumb, alt: img.alt ?? "" });
        }
      }
      posts.push({
        uri: p.uri,
        cid: p.cid,
        text: record?.text ?? "",
        authorDid: author.did,
        authorHandle: handle,
        authorDisplayName: author.displayName,
        authorAvatarUrl: author.avatar,
        publishedMs: new Date(record?.createdAt ?? Date.now()).getTime(),
        webUrl,
        images,
      });
    }
    return posts;
  });
  return result ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function atUriToRkey(atUri: string): string {
  // at://did:plc:.../app.bsky.feed.post/<rkey>
  return atUri.split("/").pop() ?? "";
}

export function blueskyEnabled(): boolean {
  return envCreds() !== null;
}
