/**
 * Admin-only: follow a remote Fediverse account.
 *
 * Accepts a handle like "@user@server.tld" or a bare actor URL. Resolves
 * the handle via WebFinger, dereferences the actor, sends a signed Follow
 * activity to their inbox, and records the pending status. The Accept
 * comes back asynchronously to our inbox where the Accept handler in
 * federation.server.ts flips the status to "accepted".
 */

import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { federation } from "~/utils/federation.server";
import {
  recordPendingFollow,
  findFollowingByActor,
} from "~/utils/federation-following.server";
import { cacheRemoteActor } from "~/utils/federation-inbox-posts.server";
import { Follow, lookupObject } from "@fedify/fedify";

const PRIMARY_USERNAME = "patrick";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  const form = await request.formData();
  const target = form.get("handle")?.toString().trim() ?? "";
  if (!target) {
    return Response.json({ error: "Missing handle." }, { status: 400 });
  }

  // Create a background federation context — we're not responding to a
  // federation request, so we synthesize one keyed to our domain.
  const origin = new URL(request.url).origin;
  const ctx = federation.createContext(new URL(origin), undefined);

  // Resolve the handle to an actor object. Fedify's lookupObject runs the
  // standard "handle? then WebFinger? then dereference?" cascade.
  let actor;
  try {
    actor = await lookupObject(target, { documentLoader: ctx.documentLoader });
  } catch (err) {
    console.error("[federation] follow lookup failed:", err);
    return Response.json(
      { error: `Could not resolve "${target}".` },
      { status: 400 }
    );
  }
  if (!actor || !("id" in actor) || !actor.id) {
    return Response.json(
      { error: `Could not resolve "${target}" to an actor.` },
      { status: 400 }
    );
  }

  const actorUri = actor.id.href;
  const inboxUri = (actor as any).inboxId?.href as string | undefined;
  const sharedInboxUri = (actor as any).endpoints?.sharedInbox?.href as
    | string
    | undefined;

  if (!inboxUri) {
    return Response.json(
      { error: "Resolved actor has no inbox URL." },
      { status: 400 }
    );
  }

  // No-op if we already follow them.
  const existing = await findFollowingByActor(PRIMARY_USERNAME, actorUri);
  if (existing && existing.status === "accepted") {
    return Response.json({ ok: true, status: "already-following", actorUri });
  }

  // Build the Follow activity. The id is something we own, so we can
  // correlate the Accept that comes back to it.
  const followActivityId = new URL(
    `${ctx.getActorUri(PRIMARY_USERNAME).href}/follows/${crypto.randomUUID()}`
  );
  const follow = new Follow({
    id: followActivityId,
    actor: ctx.getActorUri(PRIMARY_USERNAME),
    object: actor.id,
  });

  // Persist pending BEFORE sending so we don't lose the record if delivery
  // throws in flight.
  await recordPendingFollow({
    handle: PRIMARY_USERNAME,
    actorUri,
    inboxUri,
    sharedInboxUri,
    followActivityId: followActivityId.href,
  });

  // Cache the actor's display info for the friends-feed page.
  await cacheRemoteActor({
    actorUri,
    handle:
      (actor as any).preferredUsername?.toString() ?? undefined,
    fqHandle: (actor as any).preferredUsername
      ? `@${(actor as any).preferredUsername}@${new URL(actorUri).host}`
      : undefined,
    displayName: (actor as any).name?.toString() ?? undefined,
    avatarUrl: (actor as any).iconId?.href,
    profileUrl:
      (actor as any).url instanceof URL ? (actor as any).url.href : undefined,
    updatedAt: Date.now(),
  });

  try {
    await ctx.sendActivity(
      { identifier: PRIMARY_USERNAME },
      {
        id: actor.id,
        inboxId: new URL(inboxUri),
        endpoints: sharedInboxUri
          ? { sharedInbox: new URL(sharedInboxUri) }
          : null,
      },
      follow
    );
  } catch (err) {
    console.error("[federation] failed to send Follow:", err);
    return Response.json(
      { error: "Failed to send Follow activity." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, status: "pending", actorUri });
};
