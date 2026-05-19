/**
 * Admin-only: unfollow a remote Fediverse account.
 *
 * Sends an Undo(Follow) activity to the actor's inbox and removes the
 * local following record. Their server should stop sending us their posts.
 */

import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { federation } from "~/utils/federation.server";
import {
  findFollowingByActor,
  removeFollowing,
} from "~/utils/federation-following.server";
import { Follow, Undo } from "@fedify/fedify";

const PRIMARY_USERNAME = "patrick";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  const form = await request.formData();
  const actorUri = form.get("actorUri")?.toString().trim() ?? "";
  if (!actorUri) {
    return Response.json({ error: "Missing actorUri." }, { status: 400 });
  }

  const record = await findFollowingByActor(PRIMARY_USERNAME, actorUri);
  if (!record) {
    // Already not following — idempotent success.
    return Response.json({ ok: true, status: "not-following" });
  }
  if (!record.inboxUri) {
    // Can't reach them; remove locally anyway.
    await removeFollowing(PRIMARY_USERNAME, actorUri);
    return Response.json({ ok: true, status: "removed-locally" });
  }

  const origin = new URL(request.url).origin;
  const ctx = federation.createContext(new URL(origin), undefined);

  const followActivity = new Follow({
    id: record.followActivityId ? new URL(record.followActivityId) : undefined,
    actor: ctx.getActorUri(PRIMARY_USERNAME),
    object: new URL(actorUri),
  });

  const undo = new Undo({
    id: new URL(
      `${ctx.getActorUri(PRIMARY_USERNAME).href}/follows/${crypto.randomUUID()}/undo`
    ),
    actor: ctx.getActorUri(PRIMARY_USERNAME),
    object: followActivity,
  });

  try {
    await ctx.sendActivity(
      { identifier: PRIMARY_USERNAME },
      {
        id: new URL(actorUri),
        inboxId: new URL(record.inboxUri),
        endpoints: record.sharedInboxUri
          ? { sharedInbox: new URL(record.sharedInboxUri) }
          : null,
      },
      undo
    );
  } catch (err) {
    console.error("[federation] failed to send Undo(Follow):", err);
    // Still remove locally — better stale on their side than zombie on ours.
  }

  await removeFollowing(PRIMARY_USERNAME, actorUri);
  return Response.json({ ok: true, status: "unfollowed" });
};
