/**
 * Admin-only: reply to a Bluesky post.
 *
 * Mirrors /api/federation/reply but routes through Bluesky's post API
 * with reply.root / reply.parent set. Form fields:
 *
 *   parentUri  — at://... of the post being replied to
 *   parentCid  — its CID (Bluesky requires it to match)
 *   rootUri    — optional; defaults to parentUri (use when replying to a
 *                deeper-in-thread post and you know the root)
 *   rootCid    — optional; defaults to parentCid
 *   content    — HTML; stripped to plain text before sending
 */

import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { replyOnBluesky, blueskyEnabled } from "~/utils/bluesky.server";

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
  const content = form.get("content")?.toString() ?? "";

  if (!parentUri || !parentCid) {
    return Response.json(
      { error: "Missing parentUri or parentCid." },
      { status: 400 }
    );
  }
  if (!content.replace(/<[^>]+>/g, "").trim()) {
    return Response.json({ error: "Reply is empty." }, { status: 400 });
  }

  const result = await replyOnBluesky({
    text: content,
    parentUri,
    parentCid,
    rootUri,
    rootCid,
  });

  if (!result) {
    return Response.json({ error: "Bluesky reply failed." }, { status: 502 });
  }
  return Response.json({ ok: true, uri: result.uri, cid: result.cid });
};
