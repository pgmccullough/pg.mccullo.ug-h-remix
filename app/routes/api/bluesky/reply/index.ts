/**
 * Admin-only: reply to a Bluesky post.
 *
 * Mirrors /api/federation/reply but routes through Bluesky's post API
 * with reply.root / reply.parent set. After the Bluesky post lands we
 * also persist a local `myPosts` record (privacy=Public, inReplyTo set
 * to the parent's at:// URI) so the reply:
 *   - shows up on the home feed like any other post we wrote, and
 *   - threads under the parent on the friends feed (which builds the
 *     replies map by joining on `inReplyTo`).
 *
 * We store `blueskyUri` / `blueskyCid` on the local record so the
 * existing delete-on-delete cross-post logic can clean up the Bluesky
 * side if the post is removed later. We DO NOT federate this reply to
 * our Mastodon followers — it's a Bluesky-only conversation and pushing
 * it to Mastodon would look like a reply to a non-existent post.
 *
 * Form fields:
 *
 *   parentUri  — at://... of the post being replied to
 *   parentCid  — its CID (Bluesky requires it to match)
 *   rootUri    — optional; defaults to parentUri (use when replying to a
 *                deeper-in-thread post and you know the root)
 *   rootCid    — optional; defaults to parentCid
 *   content    — HTML; sanitized + stripped to plain text before sending
 */

import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { replyOnBluesky, blueskyEnabled } from "~/utils/bluesky.server";
import { clientPromise } from "~/lib/mongodb";
import { sanitizeCommentHtml } from "~/utils/sanitize.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }
  if (!blueskyEnabled()) {
    return Response.json(
      { error: "Bluesky is not configured." },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const parentUri = form.get("parentUri")?.toString().trim() ?? "";
  const parentCid = form.get("parentCid")?.toString().trim() ?? "";
  const rootUri = form.get("rootUri")?.toString().trim() || undefined;
  const rootCid = form.get("rootCid")?.toString().trim() || undefined;
  const contentRaw = form.get("content")?.toString() ?? "";
  const cleanContent = sanitizeCommentHtml(contentRaw);

  // Optional parent snapshot: the friends feed knows everything about
  // the parent post at submit time, so it forwards a snapshot we can
  // store on the local mirror. The home feed's quote-style snippet
  // reads this so the reply renders with proper attribution even
  // though we don't keep Bluesky timeline posts in Mongo.
  const parentAuthorUri = form.get("parentAuthorUri")?.toString().trim() || undefined;
  const parentDisplayName = form.get("parentDisplayName")?.toString() || undefined;
  const parentHandle = form.get("parentHandle")?.toString() || undefined;
  const parentFqHandle = form.get("parentFqHandle")?.toString() || undefined;
  const parentAvatarUrl = form.get("parentAvatarUrl")?.toString() || undefined;
  const parentUrl = form.get("parentUrl")?.toString() || undefined;
  const parentContent = form.get("parentContent")?.toString() || undefined;
  const parentPublishedMsRaw = form.get("parentPublishedMs")?.toString();
  const parentPublishedMs = parentPublishedMsRaw
    ? Number(parentPublishedMsRaw)
    : undefined;

  if (!parentUri || !parentCid) {
    return Response.json(
      { error: "Missing parentUri or parentCid." },
      { status: 400 }
    );
  }
  if (!cleanContent.replace(/<[^>]+>/g, "").trim()) {
    return Response.json({ error: "Reply is empty." }, { status: 400 });
  }

  const result = await replyOnBluesky({
    text: cleanContent,
    parentUri,
    parentCid,
    rootUri,
    rootCid,
  });

  if (!result) {
    return Response.json({ error: "Bluesky reply failed." }, { status: 502 });
  }

  // Persist the reply locally so it shows on the home feed and threads
  // under the parent on the friends feed. Same shape as a Public post
  // written through the normal create flow, with Bluesky cross-post
  // fields pre-populated (so the create endpoint's cross-poster doesn't
  // run again — we already posted via replyOnBluesky above).
  let postId: string | undefined;
  try {
    const client = await clientPromise;
    const db = client.db("user_posts");
    const now = Math.floor(Date.now() / 1000);
    const replyPost: any = {
      content: cleanContent,
      created: now,
      lastEdited: now,
      privacy: "Public",
      inReplyTo: parentUri,
      // No actor URI for Bluesky authors in our normal cache — fall back
      // to the at:// authority part for traceability when the friends
      // feed didn't forward one.
      inReplyToAuthor:
        parentAuthorUri ??
        parentUri.replace(/^at:\/\//, "").split("/")[0],
      blueskyUri: result.uri,
      blueskyCid: result.cid,
      media: {
        audio: null,
        files: "",
        images: "",
        links: "",
        videos: "",
      },
      feedback: {
        commentsOn: true,
        comments: null,
        sharesOn: true,
        shares: null,
        likesOn: true,
        likes: null,
      },
    };
    if (parentContent || parentDisplayName || parentHandle) {
      replyPost.parentSnapshot = {
        authorActorUri: parentAuthorUri,
        displayName: parentDisplayName,
        handle: parentHandle,
        fqHandle: parentFqHandle,
        avatarUrl: parentAvatarUrl,
        url: parentUrl,
        content: parentContent ?? "",
        publishedMs: Number.isFinite(parentPublishedMs)
          ? parentPublishedMs
          : undefined,
      };
    }
    const insertRes = await db.collection("myPosts").insertOne(replyPost);
    postId = insertRes.insertedId.toString();
  } catch (err) {
    // Reply made it to Bluesky; only the local mirror failed.
    console.error("[bluesky reply] local mirror insert failed:", err);
  }

  return Response.json({
    ok: true,
    uri: result.uri,
    cid: result.cid,
    postId,
  });
};
