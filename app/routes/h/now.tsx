/**
 * /h/now — a "now" page in the Derek Sivers tradition.
 *
 * A snapshot of what I'm currently up to. Not a feed, updated
 * whenever. Content lives on the admin user's `now_page` field in
 * Mongo, edited inline by the admin via a TextEditor — same pattern
 * as posts. The hardcoded DEFAULT_CONTENT is only used the very
 * first time the page loads (before any admin save has run).
 *
 * The /now page tradition lives at https://nownownow.com — reciprocal
 * linking with that directory is common.
 */

import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import type {
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { getUser } from "~/utils/session.server";
import { TextEditor } from "~/components/TextEditor/TextEditor";
import { buildMeta, SEO_CONST, stripHtml } from "~/utils/seo";

// Fallback shown before any admin save has written a `now_page` doc.
// Structured as HTML so the same rendering path handles both this
// and the eventual live content.
const DEFAULT_CONTENT = `
<p>This page is a snapshot of what I'm up to at the moment.
It's a <a href="https://nownownow.com/about" rel="noopener">/now page</a>
— a small IndieWeb tradition of telling people what you're doing
<em>right now</em> instead of only what you did in the past.</p>

<h2>Working on</h2>
<ul>
  <li>This site. Tinkering with federation, tags, embeddings, IndieWeb
  bits, and any other rabbit hole that looks promising.</li>
</ul>

<h2>Reading</h2>
<ul><li><em>(A book you're currently in the middle of.)</em></li></ul>

<h2>Listening to</h2>
<ul><li><em>(An album, artist, or podcast on repeat.)</em></li></ul>

<h2>Where</h2>
<p>St. Mark's Place, New York City.</p>
`.trim();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const admin = await db
    .collection("myUsers")
    .findOne(
      { user_name: "PGMcCullough" },
      { projection: { now_page: 1 } }
    );
  const stored = (admin as any)?.now_page as
    | { content: string; updated?: number }
    | undefined;
  const content =
    typeof stored?.content === "string" && stored.content.trim().length > 0
      ? stored.content
      : DEFAULT_CONTENT;
  const updated = typeof stored?.updated === "number" ? stored.updated : null;
  return {
    content,
    updated,
    isAdmin: user?.role === "administrator",
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const content = (data as any)?.content ?? DEFAULT_CONTENT;
  const description =
    stripHtml(content, 155) ||
    "What Patrick is up to right now — current projects, current reading, current obsessions.";
  return buildMeta({
    title: "Now",
    description,
    path: "/h/now",
    appendSiteName: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "Now — Patrick Glendon McCullough",
      url: `${SEO_CONST.SITE_URL}/h/now`,
      description,
      mainEntity: {
        "@type": "Person",
        name: SEO_CONST.AUTHOR_NAME,
        url: SEO_CONST.SITE_URL,
      },
    },
  });
};

function fmtUpdated(unix: number | null): string {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Now() {
  const { content, updated, isAdmin } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [editing, setEditing] = useState(false);
  // Local buffer for the TextEditor. Reset from loader data whenever
  // we enter edit mode so the editor starts from the current content
  // rather than a stale version.
  const [draft, setDraft] = useState<string>(content);

  useEffect(() => {
    if (editing) setDraft(content);
  }, [editing, content]);

  // When the save fetcher reports success, exit edit mode and pull
  // fresh loader data so the visible content matches what's in Mongo.
  useEffect(() => {
    const data = fetcher.data as { ok?: boolean } | undefined;
    if (fetcher.state === "idle" && data?.ok) {
      setEditing(false);
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const saving = fetcher.state !== "idle";
  const saveError =
    fetcher.state === "idle" &&
    fetcher.data &&
    (fetcher.data as any).ok === false
      ? String((fetcher.data as any).error ?? "save failed")
      : null;

  return (
    <>
      <style>{`
        .now {
          padding: 16px;
          font-family: 'PGM Sans', sans-serif;
          color: #333;
          max-width: 620px;
        }
        .now__head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .now h1 { font-size: 24px; color: #506982; margin: 0 0 4px; }
        .now__updated { font-size: 12px; color: #888; margin-bottom: 20px; }
        .now__actions {
          display: flex;
          gap: 6px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .now__actions button {
          padding: 4px 12px 2px;
          height: auto;
        }
        .now__error {
          font-size: 12px;
          color: #b53838;
          margin-bottom: 8px;
        }
        .now h2 {
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #506982;
          margin: 24px 0 8px;
        }
        .now p { line-height: 1.6; margin: 0 0 12px; font-size: 15px; }
        .now ul { padding-left: 20px; margin: 0 0 12px; line-height: 1.6; }
        .now li { margin-bottom: 6px; }
        .now a, .now a:visited { color: #4A6CBA; text-decoration: none; }
        .now a:hover { text-decoration: underline; }
        .now__footer {
          margin-top: 32px;
          padding-top: 16px;
          border-top: 1px solid #e6e6e6;
          font-size: 12px;
          color: #888;
        }
        .now__editor {
          border: 1px solid #979997;
          border-radius: 4px;
          padding: 8px;
          background: #fff;
          min-height: 240px;
        }
        [data-theme="dark"] .now { color: #e5e7eb; }
        [data-theme="dark"] .now h1,
        [data-theme="dark"] .now h2 { color: #a1b5c9; }
        [data-theme="dark"] .now__updated,
        [data-theme="dark"] .now__footer { color: #94a3b8; }
        [data-theme="dark"] .now__footer { border-top-color: #2a3543; }
        [data-theme="dark"] .now__editor {
          background: #1a2028;
          border-color: #2a3543;
        }
      `}</style>
      <section className="now">
        <div className="now__head">
          <h1>Now</h1>
          {isAdmin && !editing ? (
            <div className="now__actions">
              <button type="button" onClick={() => setEditing(true)}>
                EDIT
              </button>
            </div>
          ) : null}
        </div>
        <div className="now__updated">
          {updated ? `Updated ${fmtUpdated(updated)}` : "Not yet updated"}
        </div>

        {editing ? (
          <>
            <div className="now__editor">
              <TextEditor
                htmlString={content}
                contentStateSetter={setDraft}
                placeholderText="What are you up to right now?"
              />
            </div>
            {saveError ? (
              <div className="now__error">Error: {saveError}</div>
            ) : null}
            <div className="now__actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("nowContent", draft);
                  fetcher.submit(fd, {
                    method: "post",
                    action: "/api/siteData/now",
                  });
                }}
              >
                {saving ? "SAVING…" : "SAVE"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(false)}
                style={{ background: "#888" }}
              >
                CANCEL
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="fake-p"
              dangerouslySetInnerHTML={{ __html: content }}
            />
            <div className="now__footer">
              Inspired by the{" "}
              <a href="https://nownownow.com" rel="noopener">
                /now page movement
              </a>{" "}
              — see what everyone else is up to right now.
            </div>
          </>
        )}
      </section>
    </>
  );
}
