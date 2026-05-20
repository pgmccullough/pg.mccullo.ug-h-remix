/**
 * Admin-only: fetch the direct replies on a remote post (Mastodon AP)
 * so the friends feed can stream them in client-side after the page
 * has rendered.
 *
 * Why a separate endpoint? Walking the AP replies Collection takes
 * a few HTTP hops to the origin server — too slow to do inline in
 * the loader for every visible post. The client fires this endpoint
 * per Mastodon post after mount; replies appear as they arrive.
 *
 * Mastodon's public AP endpoints don't require HTTP signatures, so
 * we use plain `fetch()` with `Accept: application/activity+json`
 * rather than going through Fedify. Cap at 10 replies per post.
 *
 * Request form:
 *   source     - "mastodon" (more sources may be added later)
 *   noteUri    - the AP URI of the post whose replies we want
 *
 * Response:
 *   { replies: Array<{ noteUri, content, timestampMs, url, author }> }
 *
 * Each `author` is `{ displayName?, handle?, fqHandle?, avatarUrl? }`
 * so the client can render the comment without a second lookup.
 */

import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";

const MAX_REPLIES = 10;

interface ReplyAuthor {
  displayName?: string;
  handle?: string;
  fqHandle?: string;
  avatarUrl?: string;
}
interface ReplyOut {
  noteUri: string;
  content: string;
  timestampMs: number;
  url?: string;
  author: ReplyAuthor;
}

async function fetchAP(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/activity+json" },
      // Don't let a stuck origin block too long.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function authorFromActor(actorUri: string, actor: any): ReplyAuthor {
  if (!actor) return {};
  let host = "";
  try { host = new URL(actorUri).host; } catch {}
  // Mastodon-style icon is `{ type: "Image", url: "..." }`; some servers
  // return an array. Guard both.
  const iconUrl =
    actor.icon?.url ??
    (Array.isArray(actor.icon) ? actor.icon[0]?.url : undefined);
  const handle = actor.preferredUsername;
  return {
    displayName: actor.name,
    handle,
    fqHandle: handle && host ? `@${handle}@${host}` : undefined,
    avatarUrl: iconUrl,
  };
}

async function fetchMastodonReplies(noteUri: string): Promise<ReplyOut[]> {
  // Get the Note so we can find its replies collection. Some servers
  // (Mastodon) expose `${noteUri}/replies` directly; we use it as a
  // shortcut if `note.replies` doesn't yield a URL.
  const note = await fetchAP(noteUri);

  let collectionUrl: string | null = null;
  let inlinePage: any = null;
  if (note?.replies) {
    if (typeof note.replies === "string") collectionUrl = note.replies;
    else if (typeof note.replies.id === "string") collectionUrl = note.replies.id;
    else if (note.replies.first) {
      if (typeof note.replies.first === "string") collectionUrl = note.replies.first;
      else inlinePage = note.replies.first;
    }
  }
  if (!collectionUrl && !inlinePage) {
    collectionUrl = `${noteUri.replace(/\/$/, "")}/replies`;
  }

  // Resolve to a CollectionPage with items.
  let page = inlinePage;
  if (!page && collectionUrl) {
    const collection = await fetchAP(collectionUrl);
    if (collection) {
      if (collection.first) {
        page = typeof collection.first === "string"
          ? await fetchAP(collection.first)
          : collection.first;
      } else {
        page = collection;
      }
    }
  }
  const items: any[] = page?.items ?? page?.orderedItems ?? [];
  if (!items.length) return [];
  const capped = items.slice(0, MAX_REPLIES);

  // Resolve each item (may already be inlined as an object).
  const noteResults = await Promise.allSettled(
    capped.map((item) =>
      typeof item === "string"
        ? fetchAP(item)
        : Promise.resolve(item)
    )
  );
  const notes = noteResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && !!r.value)
    .map((r) => {
      // A Create activity wrapping a Note vs. a bare Note.
      const obj = r.value;
      return obj?.type === "Create" ? obj.object : obj;
    })
    .filter((n) => n && (n.type === "Note" || n.type === "Article"));

  // Collect unique author URIs and fetch in parallel.
  const authorUris = new Set<string>();
  for (const n of notes) {
    const aUri = typeof n.attributedTo === "string"
      ? n.attributedTo
      : n.attributedTo?.id;
    if (typeof aUri === "string") authorUris.add(aUri);
  }
  const authorList = Array.from(authorUris);
  const authorResults = await Promise.allSettled(
    authorList.map((uri) => fetchAP(uri))
  );
  const authorByUri = new Map<string, ReplyAuthor>();
  for (let i = 0; i < authorList.length; i++) {
    const r = authorResults[i];
    if (r.status === "fulfilled" && r.value) {
      authorByUri.set(authorList[i], authorFromActor(authorList[i], r.value));
    }
  }

  // Build out.
  const out: ReplyOut[] = [];
  for (const n of notes) {
    const aUri = typeof n.attributedTo === "string"
      ? n.attributedTo
      : n.attributedTo?.id;
    const author = (aUri && authorByUri.get(aUri)) || {};
    out.push({
      noteUri: typeof n.id === "string" ? n.id : "",
      content: typeof n.content === "string" ? n.content : "",
      timestampMs: new Date(n.published ?? Date.now()).getTime(),
      url: typeof n.url === "string" ? n.url : undefined,
      author,
    });
  }
  return out;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  const form = await request.formData();
  const source = form.get("source")?.toString();
  const noteUri = form.get("noteUri")?.toString();

  if (!noteUri || !source) {
    return Response.json(
      { error: "Missing noteUri or source." },
      { status: 400 }
    );
  }

  if (source !== "mastodon") {
    // Bluesky is fetched server-side already; if other sources are
    // added later they'd plug in here.
    return Response.json({ replies: [] });
  }

  try {
    const replies = await fetchMastodonReplies(noteUri);
    return Response.json({ replies });
  } catch (err) {
    console.error("[friends thread-replies] failed:", err);
    return Response.json({ replies: [] });
  }
};
