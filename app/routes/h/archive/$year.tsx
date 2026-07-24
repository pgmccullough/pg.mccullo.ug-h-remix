/**
 * /h/archive/:year — month index for one year.
 *
 * Lists every month in :year that has at least one public post plus
 * the count. Each month links down to /h/archive/:year/:month for
 * the actual post list. Rejects malformed years (non-numeric or out
 * of range) with 404.
 */

import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { buildMeta } from "~/utils/seo";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const year = Number(params.year);
  if (!Number.isFinite(year) || year < 1990 || year > 2100) {
    throw new Response("Not Found", { status: 404 });
  }
  const from = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const to = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
      created: { $gte: from, $lt: to },
    })
    .project({ created: 1 })
    .toArray();

  if (posts.length === 0) {
    throw new Response("Not Found", { status: 404 });
  }

  const monthCounts = new Map<number, number>();
  for (const p of posts) {
    if (typeof p.created !== "number") continue;
    const m = new Date(p.created * 1000).getUTCMonth() + 1;
    monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
  }
  const months = Array.from(monthCounts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([month, count]) => ({ month, count }));
  return { year, months, total: posts.length };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) return [];
  const { year, total } = data as { year: number; total: number };
  return buildMeta({
    title: `${year} archive`,
    description: `${total} posts from ${year} on Patrick Glendon McCullough's site.`,
    path: `/h/archive/${year}`,
    ogType: "website",
    appendSiteName: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${year} archive`,
      url: `https://pg.mccullo.ug/h/archive/${year}`,
    },
  });
};

export default function ArchiveYear() {
  const { year, months, total } = useLoaderData<typeof loader>();
  return (
    <div className="archive">
      <div className="archive__crumbs">
        <Link to="/h/archive">← Archive</Link>
      </div>
      <h1 className="archive__title">{year}</h1>
      <div className="archive__count">
        {total} {total === 1 ? "post" : "posts"}
      </div>
      <ul className="archive__list">
        {months.map((m: { month: number; count: number }) => (
          <li key={m.month}>
            <Link
              to={`/h/archive/${year}/${String(m.month).padStart(2, "0")}`}
              className="archive__year-link"
            >
              <span className="archive__year">{MONTH_NAMES[m.month - 1]}</span>
              <span className="archive__year-count">
                {m.count} {m.count === 1 ? "post" : "posts"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
