/**
 * Admin-only: reply to a remote (or local) post.
 *
 * Creates a Post in our `myPosts` collection with privacy=Public and
 * inReplyTo set, then federates it to the original author + our followers
 * via the same path as a normal new-post publish.
 */

import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";
import { sanitizeCommentHtml } from "~/utils/sanitize.server";
import { federatePostToFollowers } from "~/utils/federation-posts.server";
import { lookupObject } from "@fedify/fedify";
import { federation } from "~/utils/federation.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  const form = await request.formData();
  const parentNoteUri = form.get("parentNoteUri")?.toString().trim() ?? "";
  const parentAuthorUri = form.get("parentAuthorUri")?.toString().trim() ?? "";
  const parentInboxUri = form.get("parentInboxUri")?.toString().trim() ?? "";
  const contentRaw = form.get("content")?.toString() ?? "";
  const cleanContent = sanitizeCommentHtml(contentRaw);

  if (!parentNoteUri || !parentAuthorUri) {
    return Response.json({ error: "Missing parent." }, { status: 400 });
  }
  if (!cleanContent.replace(/<[^>]+>/g, "").trim()) {
    return Response.json({ error: "Reply is empty." }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");

  const now = Math.floor(Date.now() / 1000);
  const replyPost = {
    content: cleanContent,
    created: now,
    lastEdited: now,
    privacy: "Public",
    inReplyTo: parentNoteUri,
    inReplyToAuthor: parentAuthorUri,
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

  const result = await db.collection("myPosts").insertOne(replyPost);
  const postId = result.insertedId.toString();

  // Federate to followers (as a normal post). We also want to ensure the
  // original author gets it — they may not be a follower, but Mastodon
  // expects inReplyTo'd posts to be delivered to the parent's author too.
  const origin = new URL(request.url).origin;
  try {
    await federatePostToFollowers({ client, origin, postId });
  } catch (err) {
    console.error("[reply] follower federation failed:", err);
  }

  // Deliver directly to the original author's inbox (if we can find it).
  try {
    let inboxUri = parentInboxUri;
    if (!inboxUri) {
      const ctx = federation.createContext(new URL(origin), undefined);
      const actor = await lookupObject(parentAuthorUri, {
        documentLoader: ctx.documentLoader,
      });
      inboxUri = (actor as any)?.inboxId?.href;
    }
    if (inboxUri) {
      const { federation: fed } = await import("~/utils/federation.server");
      const ctx = fed.createContext(new URL(origin), undefined);
      // Re-use postToCreate from the federation-posts module to build the
      // Create activity, then send it directly to the parent author.
      const { postToCreate, findPublicPostById } = await import(
        "~/utils/federation-posts.server"
      );
      const post = await findPublicPostById(postId);
      if (post) {
        const activity = postToCreate(post, ctx);
        await ctx.sendActivity(
          { identifier: "patrick" },
          {
            id: new URL(parentAuthorUri),
            inboxId: new URL(inboxUri),
            endpoints: null,
          },
          activity
        );
      }
    }
  } catch (err) {
    console.error("[reply] direct delivery to parent author failed:", err);
  }

  return Response.json({ ok: true, postId });
};
