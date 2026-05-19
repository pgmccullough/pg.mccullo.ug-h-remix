/**
 * Bluesky client wrapper.
 *
 * We're not implementing AT Protocol — just acting as a logged-in Bluesky
 * client (cross-poster) using the official @atproto/api library.
 *
 * `@atproto/api` is imported LAZILY inside each function so a problem
 * with the library's module-init (e.g., missing exports, bundling
 * quirks, or env-specific globals) can never take down the rest of the
 * SSR bundle. If the lazy import fails, the function logs and returns
 * null — Bluesky is just "disabled" for that call, the rest of the
 * site keeps working.
 *
 * Auth: app password via env vars (BLUESKY_IDENTIFIER + BLUESKY_APP_PASSWORD).
 */

declare global {
  // eslint-disable-next-line no-var
  var __blueskyAgent: any | undefined;
}

function envCreds(): { identifier: string; password: string } | null {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;
  return { identifier, password };
}

async function getAgent(): Promise<any | null> {
  const creds = envCreds();
  if (!creds) return null;
  if (globalThis.__blueskyAgent) return globalThis.__blueskyAgent;

  let BskyAgent: any;
  try {
    const mod = await import("@atproto/api");
    BskyAgent = (mod as any).BskyAgent ?? (mod as any).default?.BskyAgent;
  } catch (err) {
    console.error("[bluesky] failed to load @atproto/api:", err);
    return null;
  }
  if (!BskyAgent) {
    console.error("[bluesky] BskyAgent not found in @atproto/api exports");
    return null;
  }

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

async function withRetry<T>(fn: (agent: any) => Promise<T>): Promise<T | null> {
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

const POST_CHAR_LIMIT = 300;
const MAX_IMAGES = 4;

export interface BlueskyPostResult {
  uri: string;
  cid: string;
}

export async function postToBluesky(args: {
  permalinkUrl?: string;
  text: string;
  imageUrls?: string[];
}): Promise<BlueskyPostResult | null> {
  return withRetry(async (agent) => {
    let RichText: any;
    try {
      const mod = await import("@atproto/api");
      RichText = (mod as any).RichText ?? (mod as any).default?.RichText;
    } catch (err) {
      console.error("[bluesky] failed to load RichText:", err);
      return null;
    }

    let plain = stripHtml(args.text).trim();
    if (!plain && (!args.imageUrls || args.imageUrls.length === 0)) {
      console.warn("[bluesky] skipping empty post");
      return null;
    }

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

    const rt = RichText ? new RichText({ text }) : null;
    if (rt?.detectFacets) {
      try { await rt.detectFacets(agent); } catch { /* ignore facet errors */ }
    }

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
        embed.images.push({ alt: "", image: uploaded.data.blob });
      } catch (err) {
        console.error(`[bluesky] image upload failed for ${url}:`, err);
      }
    }

    const result = await agent.post({
      text: rt ? rt.text : text,
      facets: rt?.facets,
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
// Likes
// ---------------------------------------------------------------------------

/**
 * Like a Bluesky post given its at:// URI and CID. Returns the at:// URI
 * of the like record we just created — you'll need that later to undo it
 * (via deleteBlueskyLike). Returns null on failure / disabled.
 */
export async function likeBlueskyPost(args: {
  uri: string;
  cid: string;
}): Promise<{ uri: string; cid: string } | null> {
  return withRetry(async (agent) => {
    const res = await agent.like(args.uri, args.cid);
    return { uri: res.uri, cid: res.cid };
  });
}

export async function deleteBlueskyLike(likeUri: string): Promise<boolean> {
  const result = await withRetry(async (agent) => {
    await agent.deleteLike(likeUri);
    return true;
  });
  return result === true;
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

/**
 * Reply to a Bluesky post. For top-level posts, root == parent; for
 * deeper-in-thread replies the caller should ideally pass the true root.
 * We accept both; if rootUri/rootCid are omitted we use parent for both.
 */
export async function replyOnBluesky(args: {
  text: string;
  parentUri: string;
  parentCid: string;
  rootUri?: string;
  rootCid?: string;
}): Promise<{ uri: string; cid: string } | null> {
  return withRetry(async (agent) => {
    let RichText: any;
    try {
      const mod = await import("@atproto/api");
      RichText = (mod as any).RichText ?? (mod as any).default?.RichText;
    } catch (err) {
      console.error("[bluesky] failed to load RichText:", err);
      return null;
    }

    const plain = stripHtml(args.text).trim();
    if (!plain) return null;

    // Bluesky's 300-char limit applies to replies too.
    const text = plain.length > 300 ? plain.slice(0, 299) + "…" : plain;

    const rt = RichText ? new RichText({ text }) : null;
    if (rt?.detectFacets) {
      try { await rt.detectFacets(agent); } catch { /* ignore */ }
    }

    const reply = {
      root: {
        uri: args.rootUri ?? args.parentUri,
        cid: args.rootCid ?? args.parentCid,
      },
      parent: {
        uri: args.parentUri,
        cid: args.parentCid,
      },
    };

    const result = await agent.post({
      text: rt ? rt.text : text,
      facets: rt?.facets,
      reply,
    });
    return { uri: result.uri, cid: result.cid };
  });
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
      const author = p.author;
      const handle = author.handle;
      const webUrl = `https://bsky.app/profile/${handle}/post/${atUriToRkey(p.uri)}`;
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
  return atUri.split("/").pop() ?? "";
}

export function blueskyEnabled(): boolean {
  return envCreds() !== null;
}
