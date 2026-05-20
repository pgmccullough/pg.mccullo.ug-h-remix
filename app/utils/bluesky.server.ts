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

// Bluesky enforces its own size + duration caps on the video service. We
// also bound how long we'll wait for the encode job to finish before we
// post without the video — a Vercel function only has so much budget.
const VIDEO_UPLOAD_POLL_MS = 1000;
const VIDEO_UPLOAD_TIMEOUT_MS = 10000;
// Don't even try Bluesky video for files bigger than this — the bytes
// have to ride through our Vercel function and we don't want to OOM.
// Bump if you upgrade Vercel function memory.
const VIDEO_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

const VIDEO_SERVICE_HOST = "video.bsky.app";
const VIDEO_SERVICE_DID = "did:web:video.bsky.app";

/**
 * Run Bluesky's video upload pipeline:
 *   1. Mint a service-auth token addressed to the video service.
 *   2. POST the bytes to `app.bsky.video.uploadVideo` (returns a job id).
 *   3. Poll `app.bsky.video.getJobStatus` until JOB_STATE_COMPLETED, which
 *      yields the BlobRef we can stick on `app.bsky.embed.video`.
 *
 * Returns the BlobRef on success, or `null` if any step fails or the job
 * isn't done within the polling budget. Failure is non-fatal — caller
 * should post without the video embed.
 */
async function uploadBlueskyVideo(args: {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}): Promise<any | null> {
  return withRetry(async (agent) => {
    const did = agent.session?.did;
    if (!did) {
      console.warn("[bluesky] video: no session DID");
      return null;
    }
    if (args.bytes.byteLength > VIDEO_UPLOAD_MAX_BYTES) {
      console.warn(
        `[bluesky] video: ${args.bytes.byteLength} bytes exceeds ${VIDEO_UPLOAD_MAX_BYTES}; skipping`
      );
      return null;
    }

    // 1. Service-auth token addressed to the video service.
    let token: string;
    try {
      const auth = await agent.com.atproto.server.getServiceAuth({
        aud: VIDEO_SERVICE_DID,
        exp: Math.floor(Date.now() / 1000) + 60 * 30,
        lxm: "app.bsky.video.uploadVideo",
      });
      token = auth.data.token;
    } catch (err) {
      console.error("[bluesky] video: getServiceAuth failed:", err);
      return null;
    }

    // 2. Upload bytes to the video service.
    const params = new URLSearchParams({
      did,
      name: args.filename,
    });
    const uploadUrl = `https://${VIDEO_SERVICE_HOST}/xrpc/app.bsky.video.uploadVideo?${params.toString()}`;
    let jobId: string;
    try {
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": args.contentType,
          "Content-Length": String(args.bytes.byteLength),
        },
        body: args.bytes,
      });
      if (!res.ok) {
        console.error(
          "[bluesky] video upload failed:",
          res.status,
          await res.text().catch(() => "")
        );
        return null;
      }
      const data: any = await res.json();
      jobId = data?.jobId ?? data?.jobStatus?.jobId;
      if (!jobId) {
        console.error("[bluesky] video upload: no jobId in response", data);
        return null;
      }
    } catch (err) {
      console.error("[bluesky] video upload exception:", err);
      return null;
    }

    // 3. Poll for job completion. Bound by VIDEO_UPLOAD_TIMEOUT_MS so we
    //    don't blow the function's budget on encoding.
    const start = Date.now();
    while (Date.now() - start < VIDEO_UPLOAD_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, VIDEO_UPLOAD_POLL_MS));
      try {
        const { data } = await agent.app.bsky.video.getJobStatus({ jobId });
        const state = data?.jobStatus?.state;
        if (state === "JOB_STATE_COMPLETED") {
          return data.jobStatus.blob ?? null;
        }
        if (state === "JOB_STATE_FAILED") {
          console.error(
            "[bluesky] video job failed:",
            data.jobStatus.error,
            data.jobStatus.message
          );
          return null;
        }
      } catch (err) {
        console.error("[bluesky] video getJobStatus failed:", err);
      }
    }
    console.warn(
      `[bluesky] video job ${jobId} did not complete within ${VIDEO_UPLOAD_TIMEOUT_MS}ms — posting without embed`
    );
    return null;
  });
}

export interface BlueskyPostResult {
  uri: string;
  cid: string;
}

export async function postToBluesky(args: {
  permalinkUrl?: string;
  text: string;
  imageUrls?: string[];
  /**
   * Optional video URLs. Bluesky allows only ONE video per post and can't
   * mix video with images, so we only use the first entry and ignore
   * `imageUrls` when a video successfully uploads. If video upload fails
   * we fall back to the image path.
   */
  videoUrls?: string[];
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
    const hasMedia =
      (args.imageUrls && args.imageUrls.length > 0) ||
      (args.videoUrls && args.videoUrls.length > 0);
    if (!plain && !hasMedia) {
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

    // Try video first — Bluesky doesn't allow images + video in the same
    // post, and a video is the more interesting payload. If the video
    // pipeline fails or times out we'll fall through to images.
    let embed: any;
    const videoUrl = args.videoUrls?.[0];
    if (videoUrl) {
      try {
        const res = await fetch(videoUrl);
        if (res.ok) {
          const contentType = res.headers.get("content-type") ?? "video/mp4";
          const filename = videoUrl.split("/").pop() ?? "video.mp4";
          const bytes = new Uint8Array(await res.arrayBuffer());
          const blobRef = await uploadBlueskyVideo({
            bytes,
            filename,
            contentType,
          });
          if (blobRef) {
            embed = { $type: "app.bsky.embed.video", video: blobRef };
          }
        } else {
          console.error(
            `[bluesky] could not fetch video ${videoUrl}: HTTP ${res.status}`
          );
        }
      } catch (err) {
        console.error(`[bluesky] video upload pipeline failed for ${videoUrl}:`, err);
      }
    }

    // Fall back to images only when video didn't produce an embed.
    if (!embed) {
      const images = (args.imageUrls ?? []).slice(0, MAX_IMAGES);
      if (images.length) {
        embed = { $type: "app.bsky.embed.images", images: [] as any[] };
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
        // If every image upload failed, drop the empty embed so we don't
        // post a malformed record.
        if (embed.images.length === 0) embed = undefined;
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

export interface BlueskyExternalEmbed {
  uri: string;
  title: string;
  description: string;
  thumbUrl?: string;
}

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
  /** OG-style link card Bluesky already extracted for us. */
  external?: BlueskyExternalEmbed;
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
      let external: BlueskyExternalEmbed | undefined;
      const embed: any = p.embed;
      // Bluesky's view-layer embed types we care about:
      //   app.bsky.embed.images#view         -> attached photos
      //   app.bsky.embed.external#view       -> OG link card
      //   app.bsky.embed.recordWithMedia#view-> quoted post + media (the
      //                                         media side can be either of the
      //                                         above; check both)
      const candidates: any[] = [embed];
      if (embed?.$type === "app.bsky.embed.recordWithMedia#view") {
        candidates.push(embed.media);
      }
      for (const e of candidates) {
        if (!e) continue;
        if (e.$type === "app.bsky.embed.images#view" && e.images) {
          for (const img of e.images) {
            images.push({ url: img.fullsize ?? img.thumb, alt: img.alt ?? "" });
          }
        } else if (
          e.$type === "app.bsky.embed.external#view" &&
          e.external?.uri
        ) {
          external = {
            uri: e.external.uri,
            title: e.external.title ?? "",
            description: e.external.description ?? "",
            thumbUrl: e.external.thumb || undefined,
          };
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
        external,
      });
    }
    return posts;
  });
  return result ?? [];
}

// ---------------------------------------------------------------------------
// Following (graph)
// ---------------------------------------------------------------------------

export interface BlueskyFollow {
  did: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl: string;
}

/**
 * Fetch the accounts the logged-in Bluesky user follows. Paginates through
 * the cursor up to a safety cap so we don't accidentally pull thousands.
 */
export async function fetchBlueskyFollowing(opts: { limit?: number } = {}): Promise<
  BlueskyFollow[]
> {
  const cap = opts.limit ?? 500;
  const result = await withRetry(async (agent) => {
    const me = agent.session?.did ?? agent.session?.handle;
    if (!me) return [];
    const follows: BlueskyFollow[] = [];
    let cursor: string | undefined;
    while (follows.length < cap) {
      const res: any = await agent.getFollows({
        actor: me,
        limit: Math.min(100, cap - follows.length),
        cursor,
      });
      for (const f of res.data.follows ?? []) {
        follows.push({
          did: f.did,
          handle: f.handle,
          displayName: f.displayName,
          avatarUrl: f.avatar,
          profileUrl: `https://bsky.app/profile/${f.handle}`,
        });
      }
      cursor = res.data.cursor;
      if (!cursor) break;
    }
    return follows;
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
