/**
 * /h/archive — year index for the archive drill-down.
 *
 * Chronological entry point: shows every year that has at least one
 * public post, plus a count. Links each year to /h/archive/:year
 * for the month drill-down. Complements /h/tag/:tag (topical) with
 * a second axis (temporal) for readers who want to browse by date.
 *
 * Real SEO win too — Google loves deep internal linking, and this
 * gives every published post at least one more inbound path from
 * an authority page (the archive index itself accumulates page-rank
 * from being linked in the footer / nav).
 */

import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { buildMeta } from "~/utils/seo";

export const loader = async (_args: LoaderFunctionArgs) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  // Full-collection scan on projected fields — cheap at personal-blog
  // scale (hundreds of docs). Aggregate could be more idiomatic but
  // needs an index on {created:1} to be faster; not worth adding one
  // just for the archive page.
  const posts = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
    })
    .project({ created: 1 })
    .toArray();

  const yearCounts = new Map<number, number>();
  for (const p of posts) {
    if (typeof p.created !== "number") continue;
    const y = new Date(p.created * 1000).getUTCFullYear();
    yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
  }
  const years = Array.from(yearCounts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, count]) => ({ year, count }));
  const total = years.reduce((n, y) => n + y.count, 0);
  return { years, total };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const total = (data as any)?.total ?? 0;
  return buildMeta({
    title: "Archive",
    description: `Browse ${total} published posts by year, going back to the beginning.`,
    path: "/h/archive",
    ogType: "website",
    appendSiteName: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Archive — Patrick Glendon McCullough",
      url: "https://pg.mccullo.ug/h/archive",
    },
  });
};

export default function ArchiveIndex() {
  const { years, total } = useLoaderData<typeof loader>();
  return (
    <div className="archive">
      <div className="archive__crumbs">
        <Link to="/h">← Feed</Link>
      </div>
      <h1 className="archive__title">Archive</h1>
      <div className="archive__count">
        {total} {total === 1 ? "post" : "posts"} across{" "}
        {years.length} {years.length === 1 ? "year" : "years"}
      </div>
      <ul className="archive__list">
        {years.map((y: { year: number; count: number }) => (
          <li key={y.year}>
            <Link to={`/h/archive/${y.year}`} className="archive__year-link">
              <span className="archive__year">{y.year}</span>
              <span className="archive__year-count">
                {y.count} {y.count === 1 ? "post" : "posts"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
