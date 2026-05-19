/**
 * Admin-only: like or boost a remote Note (or undo either).
 *
 * Request body (form data):
 *   noteUri    — canonical AP id of the Note to interact with
 *   authorUri  — actor URI of the post's author (so we can deliver to them)
 *   inboxUri   — their inbox URL (we already cached when we received the post)
 *   kind       — "like" | "boost"
 *   undo       — "1" to undo a previous reaction
 */

import type { ActionFunctionArgs } from "react-router";
import { Like, Announce, Undo, lookupObject } from "@fedify/fedify";

import { getUser } from "~/utils/session.server";
import { federation } from "~/utils/federation.server";
import {
  recordMyReaction,
  removeMyReaction,
  findMyReaction,
  type ReactionKind,
} from "~/utils/federation-interactions.server";
import { listFollowers } from "~/utils/federation-followers.server";

const PRIMARY_USERNAME = "patrick";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  const form = await request.formData();
  const noteUri = form.get("noteUri")?.toString().trim() ?? "";
  const authorUri = form.get("authorUri")?.toString().trim() ?? "";
  const inboxUri = form.get("inboxUri")?.toString().trim() ?? "";
  const kindRaw = form.get("kind")?.toString().trim() ?? "";
  const undo = form.get("undo")?.toString() === "1";

  if (!noteUri || !authorUri) {
    return Response.json({ error: "Missing noteUri or authorUri." }, { status: 400 });
  }
  if (kindRaw !== "like" && kindRaw !== "boost") {
    return Response.json({ error: "Invalid kind." }, { status: 400 });
  }
  const kind: ReactionKind = kindRaw;

  const origin = new URL(request.url).origin;
  const ctx = federation.createContext(new URL(origin), undefined);
  const myActor = ctx.getActorUri(PRIMARY_USERNAME);

  // Resolve the author's inbox if not provided.
  let resolvedInbox = inboxUri;
  if (!resolvedInbox) {
    try {
      const actor = await lookupObject(authorUri, {
        documentLoader: ctx.documentLoader,
      });
      const i = (actor as any)?.inboxId?.href as string | undefined;
      if (i) resolvedInbox = i;
    } catch (err) {
      console.error("[react] couldn't dereference author:", err);
    }
  }
  if (!resolvedInbox) {
    return Response.json({ error: "Couldn't find author's inbox." }, { status: 400 });
  }

  const recipient = {
    id: new URL(authorUri),
    inboxId: new URL(resolvedInbox),
    endpoints: null,
  };

  if (undo) {
    // Find the original activity id so the Undo references the right thing.
    const existing = await findMyReaction(noteUri, kind);
    if (!existing) {
      return Response.json({ ok: true, status: "not-present" });
    }
    const inner =
      kind === "like"
        ? new Like({
            id: new URL(existing.activityId),
            actor: myActor,
            object: new URL(noteUri),
          })
        : new Announce({
            id: new URL(existing.activityId),
            actor: myActor,
            object: new URL(noteUri),
          });
    const undoActivity = new Undo({
      id: new URL(`${myActor.href}/undo/${crypto.randomUUID()}`),
      actor: myActor,
      object: inner,
    });
    try {
      await ctx.sendActivity(
        { identifier: PRIMARY_USERNAME },
        recipient,
        undoActivity
      );
      // Boosts were also fanned to our followers — send the Undo to them too.
      if (kind === "boost") {
        const { items: followers } = await listFollowers(PRIMARY_USERNAME, { limit: 500 });
        await Promise.allSettled(
          followers.map((f) =>
            ctx.sendActivity(
              { identifier: PRIMARY_USERNAME },
              {
                id: new URL(f.actorUri),
                inboxId: new URL(f.inboxUri),
                endpoints: f.sharedInboxUri
                  ? { sharedInbox: new URL(f.sharedInboxUri) }
                  : null,
              },
              undoActivity
            )
          )
        );
      }
    } catch (err) {
      console.error("[react] Undo delivery failed:", err);
    }
    await removeMyReaction(noteUri, kind);
    return Response.json({ ok: true, status: "undone" });
  }

  // Send the Like or Announce.
  const activityId = new URL(`${myActor.href}/${kind}s/${crypto.randomUUID()}`);
  const activity =
    kind === "like"
      ? new Like({
          id: activityId,
          actor: myActor,
          object: new URL(noteUri),
        })
      : new Announce({
          id: activityId,
          actor: myActor,
          object: new URL(noteUri),
          // Boosts are public — addressed to PUBLIC + our followers so they
          // appear in our followers' timelines like a repost.
          to: new URL("https://www.w3.org/ns/activitystreams#Public"),
          cc: ctx.getFollowersUri(PRIMARY_USERNAME),
        });

  try {
    await ctx.sendActivity(
      { identifier: PRIMARY_USERNAME },
      recipient,
      activity
    );
    if (kind === "boost") {
      const { items: followers } = await listFollowers(PRIMARY_USERNAME, { limit: 500 });
      await Promise.allSettled(
        followers.map((f) =>
          ctx.sendActivity(
            { identifier: PRIMARY_USERNAME },
            {
              id: new URL(f.actorUri),
              inboxId: new URL(f.inboxUri),
              endpoints: f.sharedInboxUri
                ? { sharedInbox: new URL(f.sharedInboxUri) }
                : null,
            },
            activity
          )
        )
      );
    }
  } catch (err) {
    console.error("[react] delivery failed:", err);
    return Response.json({ error: "Delivery failed." }, { status: 502 });
  }

  await recordMyReaction({
    noteUri,
    kind,
    activityId: activityId.href,
    createdAt: Date.now(),
  });
  return Response.json({ ok: true, status: "sent" });
};
