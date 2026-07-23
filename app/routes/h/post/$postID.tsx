import type { LoaderFunction, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import type { PostParentSnippet } from "~/components/PostCard/PostCard";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { serializeDoc } from "~/utils/serialize.server";
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

  return { post: serialized, parent, user };
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
  const bodyText = stripHtml(post.content, 220);
  const excerptTitle = stripHtml(post.content, 70) || "Post";
  // OG image priority:
  //   1. First attached image on the post (real content wins)
  //   2. Dynamically-generated card at /api/og/:postId (satori)
  //   3. Site default (buildMeta fallback)
  let image: string | undefined;
  const firstImg = Array.isArray(post.media?.images) ? post.media.images[0] : undefined;
  if (typeof firstImg === "string" && firstImg.length) {
    image = `${SEO_CONST.SITE_URL}/api/media/images/${firstImg}`;
  } else if (params.postID) {
    image = `${SEO_CONST.SITE_URL}/api/og/${params.postID}`;
  }
  const publishedIso = typeof post.created === "number"
    ? new Date(post.created * 1000).toISOString()
    : undefined;
  const modifiedIso = typeof post.lastEdited === "number"
    ? new Date(post.lastEdited * 1000).toISOString()
    : undefined;
  return buildMeta({
    title: excerptTitle,
    description: bodyText,
    path,
    image,
    ogType: "article",
    publishedTime: publishedIso,
    modifiedTime: modifiedIso,
    jsonLd: blogPostingJsonLd({
      title: excerptTitle,
      description: bodyText,
      url: path,
      image,
      publishedIso,
      modifiedIso,
    }),
  });
};

export default function SinglePost() {
  const { post, parent } = useLoaderData<{
    post: any;
    parent: PostParentSnippet | null;
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
    </>
  );
}
