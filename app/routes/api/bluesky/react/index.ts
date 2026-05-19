/**
 * Admin-only: like or unlike a Bluesky post.
 *
 * Mirrors the shape of /api/federation/react but routes through the
 * Bluesky API instead of ActivityPub. Reuses the federation_my_reactions
 * collection for tracking — the `noteUri` for a Bluesky reaction is the
 * post's at:// URI, and `activityId` is the at:// URI of the like
 * record (returned by agent.like) so we can pass it to deleteLike on
 * undo.
 *
 * Form fields:
 *   uri   — at://did/app.bsky.feed.post/<rkey>
 *   cid   — the post's content hash (required by Bluesky's like API)
 *   undo  — "1" to undo a previous like
 */

import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import {
  likeBlueskyPost,
  deleteBlueskyLike,
  blueskyEnabled,
} from "~/utils/bluesky.server";
import {
  recordMyReaction,
  removeMyReaction,
  findMyReaction,
} from "~/utils/federation-interactions.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }
  if (!blueskyEnabled()) {
    return Response.json({ error: "Bluesky is not configured." }, { status: 503 });
  }

  const form = await request.formData();
  const uri = form.get("uri")?.toString().trim() ?? "";
  const cid = form.get("cid")?.toString().trim() ?? "";
  const undo = form.get("undo")?.toString() === "1";

  if (!uri) {
    return Response.json({ error: "Missing uri." }, { status: 400 });
  }

  if (undo) {
    const existing = await findMyReaction(uri, "like");
    if (!existing) {
      return Response.json({ ok: true, status: "not-present" });
    }
    const ok = await deleteBlueskyLike(existing.activityId);
    if (!ok) {
      return Response.json({ error: "Bluesky unlike failed." }, { status: 502 });
    }
    await removeMyReaction(uri, "like");
    return Response.json({ ok: true, status: "undone" });
  }

  if (!cid) {
    return Response.json({ error: "Missing cid for like." }, { status: 400 });
  }
  const result = await likeBlueskyPost({ uri, cid });
  if (!result) {
    return Response.json({ error: "Bluesky like failed." }, { status: 502 });
  }
  await recordMyReaction({
    noteUri: uri,
    kind: "like",
    activityId: result.uri,   // at:// URI of the like record — needed for undo
    createdAt: Date.now(),
  });
  return Response.json({ ok: true, status: "sent" });
};
