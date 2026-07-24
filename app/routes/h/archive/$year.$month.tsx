/**
 * /h/archive/:year/:month — list of posts in one year+month.
 *
 * Terminal drill-down of the archive. Renders a chronological list
 * of post excerpts + dates linking to each permalink. Bounded to
 * a single month so we never need pagination here (max ~30 posts
 * a month is generous even for prolific writers).
 *
 * :month is 1-indexed and zero-padded in URLs (e.g. /2024/03).
 */

import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";
import { buildMeta } from "~/utils/seo";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ArchivePost {
  _id: string;
  content?: string;
  created?: number;
  seoMeta?: { slug?: string; description?: string };
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const year = Number(params.year);
  const month = Number(params.month);
  if (
    !Number.isFinite(year) ||
    year < 1990 ||
    year > 2100 ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Response("Not Found", { status: 404 });
  }
  const from = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const to = Math.floor(Date.UTC(year, month, 1) / 1000);

  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
      created: { $gte: from, $lt: to },
    })
    .project({ _id: 1, content: 1, created: 1, seoMeta: 1 })
    .sort({ created: -1 })
    .toArray();

  if (posts.length === 0) {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    year,
    month,
    posts: serializeDocs(posts) as unknown as ArchivePost[],
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) return [];
  const { year, month, posts } = data as {
    year: number;
    month: number;
    posts: ArchivePost[];
  };
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  return buildMeta({
    title: `${label} archive`,
    description: `${posts.length} posts published in ${label} on Patrick Glendon McCullough's site.`,
    path: `/h/archive/${year}/${String(month).padStart(2, "0")}`,
    ogType: "website",
    appendSiteName: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${label} archive`,
      url: `https://pg.mccullo.ug/h/archive/${year}/${String(month).padStart(2, "0")}`,
    },
  });
};

function excerpt(html: string | undefined, max = 140): string {
  if (!html) return "Untitled";
  const s = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
function fmtDate(unix?: number): string {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function permalink(p: ArchivePost): string {
  const slug = p.seoMeta?.slug;
  return slug
    ? `/h/post/${p._id}/${encodeURIComponent(slug)}`
    : `/h/post/${p._id}`;
}

export default function ArchiveMonth() {
  const { year, month, posts } = useLoaderData<typeof loader>();
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  return (
    <div className="archive">
      <div className="archive__crumbs">
        <Link to={`/h/archive/${year}`}>← {year}</Link>
      </div>
      <h1 className="archive__title">{label}</h1>
      <div className="archive__count">
        {posts.length} {posts.length === 1 ? "post" : "posts"}
      </div>
      <ul className="archive__posts">
        {posts.map((p: ArchivePost) => (
          <li key={p._id}>
            <Link to={permalink(p)} className="archive__post-link">
              <span className="archive__post-date">{fmtDate(p.created)}</span>
              <span className="archive__post-excerpt">
                {(p as any).seoMeta?.description || excerpt(p.content)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
