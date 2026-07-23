import type { LoaderFunction, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import type { PostParentSnippet } from "~/components/PostCard/PostCard";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { serializeDoc, serializeDocs } from "~/utils/serialize.server";
import {
  getInboxPostsByUris,
  getRemoteActors,
} from "~/utils/federation-inbox-posts.server";
import * as gtag from "~/utils/gtags.client";
import { blogPostingJsonLd, buildMeta, stripHtml, SEO_CONST } from "~/utils/seo";

export const loader: LoaderFunction = async ({ params, request }) => {
  const { postID = "" } = params;
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
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
    throw new Response(JSON.stringify({ user, siteData }), {
      status: 404,
      statusText:
        "Sorry, this page either doesn't exist (check the spelling in the URL?) or maybe it does and you're just not allowed to see it...",
    });
  }
  const serialized = serializeDoc(post);

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

  // Related posts for internal linking + dwell time.
  // Simplest workable heuristic: 5 most recent public+published posts
  // other than this one. Could later swap for embedding similarity.
  const relatedRaw = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
      _id: { $ne: new ObjectId(postID) },
    })
    .project({ _id: 1, content: 1, created: 1 })
    .sort({ created: -1 })
    .limit(6)
    .toArray();
  const related = serializeDocs(relatedRaw).slice(0, 5);

  return { post: serialized, parent, related, user };
};

/**
 * Per-post SEO metadata. Renders proper title, description, canonical,
 * OG + Twitter Card, plus a BlogPosting JSON-LD blob. Falls back to
 * site defaults when the post is missing (e.g. 404 render).
 */
export const meta: MetaFunction<typeof loader> = ({ data, params }) => {
  const post: any = (data as any)?.post;
  const path = `/h/post/${params.postID ?? ""}`;
  if (!post) {
    return buildMeta({
      title: "Post not found",
      description: "This post either doesn't exist or isn't visible to you.",
      path,
    });
  }
  // Title excerpt cap of 55 lands nicely inside Google's ~60-char
  // display window and X's ~70-char cap. buildMeta will also skip the
  // site-name suffix on this article via appendSiteName:false since
  // og:site_name already carries site attribution.
  const excerptTitle = stripHtml(post.content, 55) || "Post";
  // buildMeta caps to 125 internally; we still pre-strip HTML.
  const bodyText = stripHtml(post.content, 125);
  // OG image: first attached image if present, served through the
  // media proxy with ?og=1 which produces a 1200x630 landscape crop
  // (aspect ratio social platforms expect). Sharp handles the resize
  // and caches to S3 as `<name>_og.jpg`. If no attached image, fall
  // back to the site default (buildMeta handles that).
  let image: string | undefined;
  const firstImg = Array.isArray(post.media?.images) ? post.media.images[0] : undefined;
  if (typeof firstImg === "string" && firstImg.length) {
    image = `${SEO_CONST.SITE_URL}/api/media/images/${firstImg}?og=1`;
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
    path,
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
      url: path,
      image,
      publishedIso,
      modifiedIso,
    }),
  });

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
          item: `${SEO_CONST.SITE_URL}${path}`,
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
  const { post, parent, related = [] } = useLoaderData<{
    post: any;
    parent: PostParentSnippet | null;
    related?: RelatedPost[];
  }>();

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
                to={`/h/post/${rp._id}`}
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
