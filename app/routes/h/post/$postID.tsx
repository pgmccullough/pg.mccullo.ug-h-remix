import type { LoaderFunction, MetaFunction } from "react-router";
import { Link, redirect, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import type { PostParentSnippet } from "~/components/PostCard/PostCard";
import { ReadingProgress } from "~/components/ReadingProgress/ReadingProgress";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { serializeDoc, serializeDocs } from "~/utils/serialize.server";
import { findBacklinksToPost } from "~/utils/backlinks.server";
import type { Backlink } from "~/utils/backlinks.server";
import { getAllEmbeddedPosts } from "~/utils/embeddings-cache.server";

/**
 * Substring-match against known link-preview and search-engine bots.
 * They only need the meta tags for their unfurl / index — skip the
 * expensive backlinks / embeddings / webmentions / backfill work
 * that a human's page-load needs. Keeps M0 Mongo from getting
 * hammered when a share on Facebook / Twitter / Slack triggers 50
 * concurrent scraper fetches of the same URL.
 */
function isLinkPreviewBot(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return (
    ua.includes("facebookexternalhit") ||
    ua.includes("meta-externalagent") ||    // Meta's newer scraper (Threads, etc.)
    ua.includes("twitterbot") ||
    ua.includes("linkedinbot") ||
    ua.includes("slackbot-linkexpanding") ||
    ua.includes("discordbot") ||
    ua.includes("whatsapp") ||
    ua.includes("telegrambot") ||
    ua.includes("bingbot") ||
    ua.includes("googlebot") ||
    ua.includes("applebot") ||
    ua.includes("bytespider") ||             // ByteDance / TikTok
    ua.includes("redditbot") ||
    ua.includes("mastodon") ||               // Mastodon link preview
    ua.includes("pleroma") ||
    ua.includes("misskey")
  );
}
import {
  getInboxPostsByUris,
  getRemoteActors,
} from "~/utils/federation-inbox-posts.server";
import * as gtag from "~/utils/gtags.client";
import { blogPostingJsonLd, buildMeta, stripHtml, SEO_CONST, wordCount } from "~/utils/seo";

export const loader: LoaderFunction = async ({ params, request }) => {
  const { postID = "", slug: urlSlug } = params;
  const client = await clientPromise;
  const db = client.db("user_posts");

  // Fast path for link-preview scrapers: skip the user-session
  // lookup and siteData fetch entirely — scrapers don't need
  // auth-gated content (they only see Public posts anyway) and
  // don't consume siteData. One Mongo query total instead of three,
  // followed by an early return with the minimal payload.
  const ua = request.headers.get("user-agent") ?? "";
  if (isLinkPreviewBot(ua)) {
    const [botPost] = await db
      .collection("myPosts")
      .find({ privacy: "Public", _id: new ObjectId(postID) })
      .toArray();
    if (!botPost) {
      throw redirect(
        `/h/_missing?from=${encodeURIComponent(`/h/post/${postID}`)}`
      );
    }
    const botSerialized = serializeDoc(botPost);
    // Canonical slug redirect still applies for scrapers so they
    // land on the URL that gets shared / indexed.
    const botSlug: string | undefined = (botSerialized as any)?.seoMeta?.slug;
    if (botSlug && urlSlug !== botSlug) {
      throw redirect(`/h/post/${postID}/${encodeURIComponent(botSlug)}`, 301);
    }
    const { embedding: _emb, ...postForClient } = botSerialized as any;
    return {
      post: postForClient,
      parent: null,
      related: [],
      webmentions: [],
      backlinks: [],
      user: null,
    };
  }

  const user = await getUser(request);
  const siteData = await db
    .collection("myUsers")
    .find({ user_name: "PGMcCullough" })
    .toArray();
  let post;
  if (user?.role !== "administrator") {
    [post] = await db
      .collection("myPosts")
      .find({ privacy: "Public", _id: new ObjectId(postID) })
      .toArray();
  } else {
    [post] = await db
      .collection("myPosts")
      .find({ _id: new ObjectId(postID) })
      .toArray();
  }
  if (!post) {
    // Redirect through the rich /h/* catchall so the visitor gets a
    // recovery page with recent posts instead of a raw ErrorBoundary.
    // Preserves the missing URL in the address bar via a soft path.
    throw redirect(`/h/_missing?from=${encodeURIComponent(`/h/post/${postID}`)}`);
  }
  const serialized = serializeDoc(post);

  // Canonical URL redirect: if this post already has an LLM-generated
  // slug on its seoMeta, the correct URL is /h/post/:id/:slug. Handle
  // both cases: bare-id (`urlSlug` undefined) and stale slug in URL.
  // 301 permanent so search engines drop the wrong variant from index.
  const postSlug: string | undefined = (serialized as any)?.seoMeta?.slug;
  if (postSlug && urlSlug !== postSlug) {
    throw redirect(`/h/post/${postID}/${encodeURIComponent(postSlug)}`, 301);
  }

  // (Bot bail-out is handled at the top of the loader, before any
  // auth/siteData work — see the isLinkPreviewBot() branch there.)

  // If this post is a reply, try to load the parent for the inline snippet.
  let parent: PostParentSnippet | null = null;
  const parentUri = (serialized as any).inReplyTo as string | undefined;
  if (parentUri) {
    const inboxParents = await getInboxPostsByUris([parentUri]);
    const ip = inboxParents[parentUri];
    if (ip) {
      const authors = await getRemoteActors([ip.authorActorUri]);
      const a = authors[ip.authorActorUri];
      parent = {
        authorActorUri: ip.authorActorUri,
        displayName: a?.displayName,
        handle: a?.handle,
        fqHandle: a?.fqHandle,
        avatarUrl: a?.avatarUrl,
        content: ip.content,
        publishedMs: ip.published,
        url: ip.url,
      };
    }
  }

  // Backfill hook: if this post has images without alt text, fire a
  // deferred kickoff to generate them. Any visitor triggers it — the
  // server does the work behind the scenes; the client is unaware.
  // Idempotent: the deferred endpoint skips images that already have
  // alts, so repeat pageviews are no-ops beyond a cheap Mongo check.
  try {
    const media: any = (serialized as any)?.media ?? {};
    const images: any[] = Array.isArray(media.images) ? media.images : [];
    const altMap: Record<string, string> = media.imageAlts && typeof media.imageAlts === "object"
      ? media.imageAlts
      : {};
    const missingAlt = images.some((img: any) => {
      const fn = typeof img === "string" ? img : img?.url || img?.file;
      return typeof fn === "string" && fn.length && !altMap[fn];
    });
    if (missingAlt) {
      const internalToken = process.env.INTERNAL_API_TOKEN;
      if (internalToken) {
        const origin = new URL(request.url).origin;
        const body = `postId=${encodeURIComponent(postID)}`;
        // Fire-and-forget — don't await; if it fails, the next
        // pageview will try again. The .catch() suppresses the
        // unhandled-rejection warning.
        void fetch(`${origin}/api/media/generate-alts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Internal-Token": internalToken,
          },
          body,
        }).catch(() => { /* silently drop; backfill is best-effort */ });
      }
    }
  } catch { /* never let backfill kickoff block the page render */ }

  // SEO meta backfill: same invisible pattern for slug + meta
  // description + topical tags. Fires when any of the three is
  // missing. Fully idempotent — once written, we never regenerate
  // (URL stability + tag stability for permalink categorization).
  try {
    const seoMeta: any = (serialized as any)?.seoMeta ?? {};
    const existingTags: string[] = Array.isArray((serialized as any)?.tags)
      ? (serialized as any).tags
      : [];
    const missingSlug = !seoMeta.slug;
    const missingDesc = !seoMeta.description;
    const missingTags = existingTags.length === 0;
    const bodyText = String((serialized as any)?.content ?? "").replace(/<[^>]+>/g, "").trim();
    if ((missingSlug || missingDesc || missingTags) && bodyText.length > 0) {
      const internalToken = process.env.INTERNAL_API_TOKEN;
      if (internalToken) {
        const origin = new URL(request.url).origin;
        const body = `postId=${encodeURIComponent(postID)}`;
        void fetch(`${origin}/api/post/generate-seo-meta`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Internal-Token": internalToken,
          },
          body,
        }).catch(() => { /* silently drop; backfill is best-effort */ });
      }
    }
  } catch { /* never let backfill kickoff block the page render */ }

  // Embedding backfill: fires when the post has no semantic vector
  // yet. Enables the related-posts ranker below to use cosine
  // similarity instead of falling back to recency. Fully idempotent.
  try {
    const existingEmb: any = (serialized as any)?.embedding;
    const hasEmbedding = Array.isArray(existingEmb) && existingEmb.length > 0;
    const bodyText = String((serialized as any)?.content ?? "").replace(/<[^>]+>/g, "").trim();
    if (!hasEmbedding && bodyText.length > 0) {
      const internalToken = process.env.INTERNAL_API_TOKEN;
      if (internalToken) {
        const origin = new URL(request.url).origin;
        const body = `postId=${encodeURIComponent(postID)}`;
        void fetch(`${origin}/api/post/generate-embedding`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Internal-Token": internalToken,
          },
          body,
        }).catch(() => { /* silently drop; backfill is best-effort */ });
      }
    }
  } catch { /* never let backfill kickoff block the page render */ }

  // Related posts for internal linking + dwell time.
  // If the current post has an embedding, rank by cosine similarity
  // (dot product on L2-normalized vectors). Fall back to recency
  // when the post hasn't been embedded yet — first pageview kicks
  // off the backfill above, subsequent visits get semantic ranking.
  const currentEmb: number[] | null = Array.isArray((serialized as any)?.embedding)
    ? ((serialized as any).embedding as number[])
    : null;
  let relatedRaw: any[];
  if (currentEmb && currentEmb.length > 0) {
    // Pull all candidates plus their embeddings, then rank in-process.
    // At personal-blog scale (hundreds of posts, ~2KB per vector) this
    // is a couple MB per query — acceptable. If the archive grows to
    // thousands, move to Atlas Vector Search's $vectorSearch stage.
    // Fetched via the shared in-memory cache — see
    // embeddings-cache.server for TTL rationale. This one call was
    // previously scanning the whole myPosts collection on every
    // permalink pageview; now it's cached across requests per
    // function instance and survives Atlas noisy-neighbor slowdowns.
    const allEmbedded = await getAllEmbeddedPosts();
    const candidates = allEmbedded.filter((p) => p._id !== postID);
    const scored = candidates
      .map((p: any) => {
        const emb = p.embedding as number[];
        if (!Array.isArray(emb) || emb.length !== currentEmb.length) {
          return { post: p, score: -Infinity };
        }
        let dot = 0;
        for (let i = 0; i < emb.length; i++) dot += currentEmb[i] * emb[i];
        return { post: p, score: dot };
      })
      .filter((x) => x.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => {
        // Trim the embedding before returning — no reason to ship 512
        // floats to the client for each related-posts card.
        const { embedding: _unused, ...rest } = x.post;
        return rest;
      });
    if (scored.length > 0) {
      relatedRaw = scored;
    } else {
      // No other embedded posts yet — fall back to recency.
      relatedRaw = await db
        .collection("myPosts")
        .find({
          privacy: "Public",
          state: { $nin: ["draft", "scheduled"] },
          _id: { $ne: new ObjectId(postID) },
        })
        .project({ _id: 1, content: 1, created: 1, seoMeta: 1 })
        .sort({ created: -1 })
        .limit(6)
        .toArray();
    }
  } else {
    relatedRaw = await db
      .collection("myPosts")
      .find({
        privacy: "Public",
        state: { $nin: ["draft", "scheduled"] },
        _id: { $ne: new ObjectId(postID) },
      })
      .project({ _id: 1, content: 1, created: 1, seoMeta: 1 })
      .sort({ created: -1 })
      .limit(6)
      .toArray();
  }
  const related = serializeDocs(relatedRaw).slice(0, 5);

  // Verified webmentions targeting this post. Keyed by targetPostId
  // which the receive endpoint sets from the URL when it matches
  // /h/post/:id or /h/post/:id/:slug.
  const rawMentions = await db
    .collection("webmentions")
    .find({ targetPostId: postID, status: "verified" })
    .sort({ "meta.publishedAt": -1, receivedAt: -1 })
    .limit(50)
    .toArray();
  const webmentions = serializeDocs(rawMentions);

  // Internal backlinks — other posts on this site that link here.
  // Distinct from webmentions (which are external cross-site pings);
  // this is my-own-posts-referencing-this-post, useful for
  // permalinks that get cited later in follow-up posts.
  const backlinks = await findBacklinksToPost(postID);

  // Trim the embedding vector off the post before shipping to the
  // client — it's a 512-float array only useful server-side for the
  // related-posts ranker. Cutting it saves ~2KB per pageload.
  const { embedding: _emb, ...postForClient } = serialized as any;

  return { post: postForClient, parent, related, webmentions, backlinks, user };
};

// Advertise the webmention endpoint via HTTP Link header on post
// pages — sites and scrapers that only look at headers (not <link>
// in HTML) can still discover it.
export function headers() {
  return {
    Link: '<https://pg.mccullo.ug/api/webmention>; rel="webmention"',
  };
}

/**
 * Per-post SEO metadata. Renders proper title, description, canonical,
 * OG + Twitter Card, plus a BlogPosting JSON-LD blob. Falls back to
 * site defaults when the post is missing (e.g. 404 render).
 */
export const meta: MetaFunction<typeof loader> = ({ data, params }) => {
  const post: any = (data as any)?.post;
  const postId = params.postID ?? "";
  // Canonical path prefers the LLM-generated slug when the post has
  // one (permalinks like /h/post/:id/best-guess-slug rank + read
  // better than bare-id URLs).
  const seoMeta = post?.seoMeta ?? {};
  const canonicalPath = seoMeta?.slug
    ? `/h/post/${postId}/${encodeURIComponent(seoMeta.slug)}`
    : `/h/post/${postId}`;
  if (!post) {
    return buildMeta({
      title: "Post not found",
      description: "This post either doesn't exist or isn't visible to you.",
      path: canonicalPath,
    });
  }
  // Title excerpt cap of 55 lands nicely inside Google's ~60-char
  // display window and X's ~70-char cap. buildMeta will also skip the
  // site-name suffix on this article via appendSiteName:false since
  // og:site_name already carries site attribution.
  const excerptTitle = stripHtml(post.content, 55) || "Post";
  // LLM description wins when present — it's a real summary, not the
  // first N chars of the body. Fallback keeps working for posts that
  // haven't been backfilled yet.
  const bodyText = seoMeta?.description || stripHtml(post.content, 125);
  // OG image priority:
  //   1. First attached image → served through /api/media/…?og=1
  //      (Sharp crops to 1200x630, cached to S3 as <name>_og.jpg).
  //   2. Generated title-card → /api/og/:postId (Sharp+SVG renders a
  //      branded card with the post's title/date, cached at the edge).
  //      Much better unfurl than the icon-sized site fallback.
  let image: string | undefined;
  const firstImg = Array.isArray(post.media?.images) ? post.media.images[0] : undefined;
  if (typeof firstImg === "string" && firstImg.length) {
    image = `${SEO_CONST.SITE_URL}/api/media/images/${firstImg}?og=1`;
  } else {
    image = `${SEO_CONST.SITE_URL}/api/og/${postId}`;
  }
  const publishedIso = typeof post.created === "number"
    ? new Date(post.created * 1000).toISOString()
    : undefined;
  const modifiedIso = typeof post.lastEdited === "number"
    ? new Date(post.lastEdited * 1000).toISOString()
    : undefined;
  const descriptors = buildMeta({
    title: excerptTitle,
    description: bodyText,
    path: canonicalPath,
    image,
    ogType: "article",
    publishedTime: publishedIso,
    modifiedTime: modifiedIso,
    // Skip the " — Patrick Glendon McCullough" suffix on posts.
    // Combined length blows past Google/X title limits; site name is
    // already carried via og:site_name in the root default meta.
    appendSiteName: false,
    jsonLd: blogPostingJsonLd({
      title: excerptTitle,
      description: bodyText,
      url: canonicalPath,
      image,
      publishedIso,
      modifiedIso,
      wordCount: wordCount(post.content),
    }),
  });

  // Preload the OG/hero image so the browser starts fetching it
  // before the HTML is parsed — improves LCP (Largest Contentful
  // Paint), which is one of the Core Web Vitals Google uses in
  // ranking. Only preload when there's a real attached image (not
  // the default site icon fallback).
  if (image && firstImg) {
    // Full-resolution image URL for the actual render, not the ?og=1
    // cropped version we serve to scrapers.
    const heroSrc = `${SEO_CONST.SITE_URL}/api/media/images/${firstImg}`;
    descriptors.push({
      tagName: "link",
      rel: "preload",
      as: "image",
      href: heroSrc,
      // fetchpriority hint for browsers that honor it (Chrome, Safari)
      fetchpriority: "high",
    });
  }

  // BreadcrumbList JSON-LD — surfaces breadcrumbs in Google's SERP
  // entry ("pg.mccullo.ug › July 2019 › Do any places…") which reads
  // better than a bare URL and typically bumps CTR.
  descriptors.push({
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SEO_CONST.SITE_URL}/h`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: excerptTitle,
          item: `${SEO_CONST.SITE_URL}${canonicalPath}`,
        },
      ],
    },
  });

  return descriptors;
};

interface RelatedPost {
  _id: string;
  content?: string;
  created?: number;
  seoMeta?: { slug?: string; description?: string };
}

interface WebmentionRow {
  _id: string;
  source: string;
  target: string;
  receivedAt?: number;
  meta?: {
    title?: string;
    authorName?: string;
    authorUrl?: string;
    authorPhoto?: string;
    content?: string;
    publishedAt?: number;
    type: "mention" | "reply" | "like" | "repost" | "bookmark";
  };
}

function wmTypeLabel(t?: WebmentionRow["meta"]["type"]): string {
  switch (t) {
    case "like": return "❤️ liked";
    case "repost": return "🔁 reposted";
    case "reply": return "💬 replied";
    case "bookmark": return "🔖 bookmarked";
    default: return "🔗 mentioned";
  }
}
function wmDate(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function wmHost(u: string): string {
  try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; }
}

function relatedExcerpt(html: string | undefined, max = 90): string {
  if (!html) return "Untitled";
  const s = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "Untitled";
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function relatedDate(unix?: number): string {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SinglePost() {
  const { post, parent, related = [], webmentions = [], backlinks = [] } = useLoaderData<{
    post: any;
    parent: PostParentSnippet | null;
    related?: RelatedPost[];
    webmentions?: WebmentionRow[];
    backlinks?: Backlink[];
  }>();

  // Split webmentions by type for display — "reactions" get compacted
  // to avatars only, "replies/mentions" get the full quote card.
  const compact = webmentions.filter((w) => w.meta?.type === "like" || w.meta?.type === "repost" || w.meta?.type === "bookmark");
  const conversational = webmentions.filter((w) => w.meta?.type === "reply" || w.meta?.type === "mention" || !w.meta?.type);

  const [editState, setEditState] = useState<{
    isOn: boolean;
    id: string | null;
  }>({ isOn: false, id: null });

  useEffect(() => {
    if (post?._id) {
      gtag.event({
        action: "post_view",
        category: "engagement",
        label: String(post._id),
        value: "",
      });
    }
  }, [post?._id]);

  return (
    <>
      {/* Thin bar at top of viewport, fills as reader scrolls
          through the post body. Self-hides on posts shorter than
          ~1.5x the viewport (no meaningful "progress" to show). */}
      <ReadingProgress />
      {post && !post.error ? (
        <PostCard
          key={post._id}
          editState={editState}
          setEditState={setEditState}
          post={post}
          parent={parent}
        />
      ) : (
        ""
      )}
      {/* Webmentions — inbound backlinks and reactions from other
          sites (and, via Bridgy, from Bluesky / Mastodon). Displayed
          in two groups: compact reactions (likes / reposts) as an
          avatar strip, and conversational (replies / mentions) as
          full quote cards. Only verified mentions show up. */}
      {(compact.length > 0 || conversational.length > 0) ? (
        <>
          <style>{`
            .wm { margin: 24px 0 8px; }
            .wm__section {
              background: #fff;
              border: 1px solid #979997;
              border-radius: 4px;
              margin-bottom: 12px;
              overflow: hidden;
            }
            .wm__head {
              background: #eee;
              padding: 8px 12px;
              font: 600 12px 'PGM Sans', sans-serif;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              color: #506982;
              border-bottom: 1px solid #979997;
            }
            .wm__body { padding: 10px 12px; }
            .wm__facepile { display: flex; flex-wrap: wrap; gap: 6px; }
            .wm__face,
            .wm__face:visited {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 32px; height: 32px;
              border-radius: 50%;
              background: #ddd;
              overflow: hidden;
              color: #506982;
              text-decoration: none;
              font-size: 12px;
            }
            .wm__face img { width: 100%; height: 100%; object-fit: cover; }
            .wm__reply {
              display: flex; gap: 10px;
              padding: 10px 0;
              border-bottom: 1px solid #f0f0f0;
            }
            .wm__reply:last-child { border-bottom: 0; }
            .wm__reply__avatar {
              width: 40px; height: 40px; border-radius: 50%;
              background: #ddd; overflow: hidden; flex-shrink: 0;
            }
            .wm__reply__avatar img { width: 100%; height: 100%; object-fit: cover; }
            .wm__reply__body { flex: 1; min-width: 0; }
            .wm__reply__head {
              display: flex; align-items: baseline; gap: 8px;
              font-size: 13px; margin-bottom: 4px;
            }
            .wm__reply__name { font-weight: 600; color: #506982; }
            .wm__reply__source,
            .wm__reply__source:visited {
              margin-left: auto;
              font-size: 11px;
              color: #888;
              text-decoration: none;
            }
            .wm__reply__source:hover { color: #4A6CBA; }
            .wm__reply__content {
              font-size: 14px; line-height: 1.5; color: #333;
              word-break: break-word;
            }
            [data-theme="dark"] .wm__section {
              background: #1a2028; border-color: #2a3543;
            }
            [data-theme="dark"] .wm__head {
              background: #232b36; color: #a1b5c9; border-color: #2a3543;
            }
            [data-theme="dark"] .wm__reply { border-color: #232b36; }
            [data-theme="dark"] .wm__reply__name { color: #a1b5c9; }
            [data-theme="dark"] .wm__reply__content { color: #e5e7eb; }
            [data-theme="dark"] .wm__reply__source { color: #94a3b8; }
            [data-theme="dark"] .wm__face { background: #2a3543; color: #a1b5c9; }
          `}</style>
          <div className="wm">
            {compact.length > 0 ? (
              <div className="wm__section">
                <div className="wm__head">
                  {compact.length} {compact.length === 1 ? "reaction" : "reactions"}
                </div>
                <div className="wm__body">
                  <div className="wm__facepile">
                    {compact.map((w) => {
                      const label = wmTypeLabel(w.meta?.type);
                      const name = w.meta?.authorName || wmHost(w.source);
                      const title = `${name} ${label} — ${wmHost(w.source)}`;
                      return (
                        <a
                          key={w._id}
                          className="wm__face"
                          href={w.source}
                          target="_blank"
                          rel="noreferrer"
                          title={title}
                        >
                          {w.meta?.authorPhoto ? (
                            <img src={w.meta.authorPhoto} alt="" />
                          ) : (
                            <span>{(name[0] || "?").toUpperCase()}</span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {conversational.length > 0 ? (
              <div className="wm__section">
                <div className="wm__head">
                  {conversational.length} mention{conversational.length === 1 ? "" : "s"} from other sites
                </div>
                <div className="wm__body">
                  {conversational.map((w) => {
                    const name = w.meta?.authorName || wmHost(w.source);
                    return (
                      <div key={w._id} className="wm__reply">
                        <div className="wm__reply__avatar">
                          {w.meta?.authorPhoto ? (
                            <img src={w.meta.authorPhoto} alt="" />
                          ) : null}
                        </div>
                        <div className="wm__reply__body">
                          <div className="wm__reply__head">
                            {w.meta?.authorUrl ? (
                              <a
                                href={w.meta.authorUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="wm__reply__name"
                              >
                                {name}
                              </a>
                            ) : (
                              <span className="wm__reply__name">{name}</span>
                            )}
                            <a
                              href={w.source}
                              target="_blank"
                              rel="noreferrer"
                              className="wm__reply__source"
                            >
                              {wmTypeLabel(w.meta?.type)} · {wmHost(w.source)}
                              {w.meta?.publishedAt ? ` · ${wmDate(w.meta.publishedAt)}` : ""}
                            </a>
                          </div>
                          <div className="wm__reply__content">
                            {w.meta?.content || w.meta?.title || wmHost(w.source)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Internal backlinks — other posts on this site that link to
          this one. Distinct from webmentions (external) — this is
          "you cited yourself" reverse discovery. Reuses the
          .backlinks CSS shared with /h/now and /h/about. */}
      {backlinks && backlinks.length > 0 ? (
        <nav className="backlinks-section" aria-label="Referenced by">
          <div className="backlinks-section__head">Referenced by</div>
          <ul className="backlinks">
            {backlinks.map((b) => (
              <li key={b._id}>
                <Link
                  to={
                    b.seoMeta?.slug
                      ? `/h/post/${b._id}/${encodeURIComponent(b.seoMeta.slug)}`
                      : `/h/post/${b._id}`
                  }
                  className="backlinks__item"
                >
                  <span className="backlinks__date">{relatedDate(b.created)}</span>
                  <span className="backlinks__excerpt">{relatedExcerpt(b.content)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {/* Related posts — internal linking that helps Google map the
          site's topical structure AND gives readers a next click.
          Rendered as a short simple list (styled like other admin
          card lists) instead of full PostCards so it doesn't
          compete visually with the main post. */}
      {related && related.length > 0 ? (
        <>
          <style>{`
            .related-posts {
              margin: 24px 0 8px;
              background: #fff;
              border: 1px solid #979997;
              border-radius: 4px;
              overflow: hidden;
            }
            .related-posts__head {
              background: #eee;
              padding: 8px 12px;
              font: 600 12px 'PGM Sans', sans-serif;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              color: #506982;
              border-bottom: 1px solid #979997;
            }
            .related-posts__item,
            .related-posts__item:visited {
              display: flex;
              gap: 10px;
              align-items: baseline;
              padding: 10px 12px;
              border-bottom: 1px solid #f0f0f0;
              color: inherit;
              text-decoration: none;
              font-size: 14px;
              line-height: 1.4;
            }
            .related-posts__item:last-child { border-bottom: 0; }
            .related-posts__item:hover { background: #f8f8f8; }
            .related-posts__date {
              flex: 0 0 90px;
              color: #888;
              font-size: 12px;
              text-align: right;
            }
            .related-posts__excerpt { flex: 1; min-width: 0; }
            [data-theme="dark"] .related-posts {
              background: #1a2028;
              border-color: #2a3543;
            }
            [data-theme="dark"] .related-posts__head {
              background: #232b36;
              color: #a1b5c9;
              border-color: #2a3543;
            }
            [data-theme="dark"] .related-posts__item {
              border-color: #232b36;
              color: #e5e7eb;
            }
            [data-theme="dark"] .related-posts__item:hover { background: #232b36; }
            [data-theme="dark"] .related-posts__date { color: #94a3b8; }
          `}</style>
          <nav className="related-posts" aria-label="More posts">
            <div className="related-posts__head">More posts</div>
            {related.map((rp) => (
              <Link
                key={rp._id}
                to={
                  rp.seoMeta?.slug
                    ? `/h/post/${rp._id}/${encodeURIComponent(rp.seoMeta.slug)}`
                    : `/h/post/${rp._id}`
                }
                className="related-posts__item"
              >
                <span className="related-posts__date">{relatedDate(rp.created)}</span>
                <span className="related-posts__excerpt">{relatedExcerpt(rp.content)}</span>
              </Link>
            ))}
          </nav>
        </>
      ) : null}
    </>
  );
}
