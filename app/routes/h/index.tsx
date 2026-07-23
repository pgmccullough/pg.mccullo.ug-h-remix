import { useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useEffect, useRef, useState } from "react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import type { PostParentSnippet } from "~/components/PostCard/PostCard";
import { SearchBar } from "~/components/SearchBar/SearchBar";
import { clientPromise } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";
import {
  getInboxPostsByUris,
  getRemoteActors,
} from "~/utils/federation-inbox-posts.server";
import { v4 as uuidv4 } from "uuid";
import type { Post } from "~/common/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db
    .collection("myUsers")
    .find({ user_name: "PGMcCullough" })
    .toArray();
  let posts;

  // ?q=... turns the home feed into a search result page. Powers
  // Google's Sitelinks Search Box (declared in root JSON-LD's
  // SearchAction) — visitors clicking the SERP search box land here
  // directly with results already loaded.
  const url = new URL(request.url);
  const searchQ = url.searchParams.get("q")?.trim() ?? "";
  if (searchQ.length > 0) {
    const isAdmin = user?.role === "administrator";
    const searchFilter: any = {
      $text: { $search: searchQ },
      state: { $nin: ["draft", "scheduled"] },
    };
    if (!isAdmin) searchFilter.privacy = "Public";
    try {
      const results = await db
        .collection("myPosts")
        .find(searchFilter)
        .project({ score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(25)
        .toArray();
      return {
        onThisDay: [],
        posts: serializeDocs(results ?? []),
        parentsByUri: {},
        siteData: { ...siteData[0] },
        user,
        searchQ,
      };
    } catch (err) {
      console.error("[/h search] failed:", err);
      // Fall through to normal feed on search error rather than 500ing.
    }
  }

  /* On This Day Calculations */
  let onThisDay;
  const date = new Date();
  const formattedMonth = Number(("0" + (date.getMonth() + 1)).slice(-2));
  const formattedDate = Number(("0" + date.getDate()).slice(-2));
  const curYear = date.getFullYear();
  const twentyFiveYears: number[] = [];
  for (let i = curYear - 1; i >= curYear - 25; i--) {
    const datenew = new Date(i, formattedMonth - 1, formattedDate);
    twentyFiveYears.push(datenew.getTime() / 1000);
  }
  const mongoOrArray: { created: object }[] = [];
  twentyFiveYears.forEach((thisDate) =>
    mongoOrArray.push({ created: { $gt: thisDate, $lt: thisDate + 86400 } })
  );
  /* End On This Day Calculations */
  // Drafts and scheduled posts never appear in the public feed; they
  // have a dedicated /h/drafts page. $nin also matches documents where
  // `state` is missing entirely (legacy posts), so backward compat holds.
  const notDraftOrScheduled = { state: { $nin: ["draft", "scheduled"] } };
  if (user?.role !== "administrator") {
    onThisDay = await db
      .collection("myPosts")
      .find({ $or: mongoOrArray, privacy: "Public", ...notDraftOrScheduled })
      .sort({ created: -1 })
      .toArray();
    posts = await db
      .collection("myPosts")
      .find({ privacy: "Public", ...notDraftOrScheduled })
      .sort({ created: -1 })
      .limit(25)
      .toArray();
  } else {
    onThisDay = await db
      .collection("myPosts")
      .find({ $or: mongoOrArray, ...notDraftOrScheduled })
      .sort({ created: -1 })
      .toArray();
    posts = await db
      .collection("myPosts")
      .find({ privacy: { $not: { $eq: "Story" } }, ...notDraftOrScheduled })
      .sort({ created: -1 })
      .limit(25)
      .toArray();
  }

  const serializedPosts = serializeDocs(posts ?? []);
  const serializedOnThisDay = serializeDocs(onThisDay ?? []);

  // For any post that is a reply, fetch the parent (if we have it stored
  // in federation_inbox_posts) plus the parent's author profile, so we
  // can render an inline "quoting" snippet. Posts whose parents we don't
  // have yet fall back to no snippet — could later trigger a background
  // fetch via lookupObject.
  const allPosts = [...serializedPosts, ...serializedOnThisDay];
  const parentUris = Array.from(
    new Set(
      allPosts
        .map((p: any) => p.inReplyTo as string | undefined)
        .filter((u): u is string => typeof u === "string" && u.length > 0)
    )
  );
  let parentsByUri: Record<string, PostParentSnippet> = {};
  if (parentUris.length) {
    const inboxParents = await getInboxPostsByUris(parentUris);
    const authorUris = Array.from(
      new Set(Object.values(inboxParents).map((p) => p.authorActorUri))
    );
    const authors = await getRemoteActors(authorUris);
    for (const [uri, ip] of Object.entries(inboxParents)) {
      const a = authors[ip.authorActorUri];
      parentsByUri[uri] = {
        authorActorUri: ip.authorActorUri,
        displayName: a?.displayName,
        handle: a?.handle,
        fqHandle: a?.fqHandle,
        avatarUrl: a?.avatarUrl,
        content: ip.content,
        publishedMs: ip.published,
        url: ip.url,
      };
    }
  }

  // Some replies carry their own snapshot of the parent (currently:
  // Bluesky replies, because we don't persist Bluesky timeline posts in
  // federation_inbox_posts). Fill in any parents not already covered by
  // the inbox lookup above.
  for (const p of allPosts as any[]) {
    if (
      p.inReplyTo &&
      !parentsByUri[p.inReplyTo] &&
      p.parentSnapshot &&
      typeof p.parentSnapshot === "object"
    ) {
      const s = p.parentSnapshot;
      parentsByUri[p.inReplyTo] = {
        authorActorUri: s.authorActorUri ?? p.inReplyTo,
        displayName: s.displayName,
        handle: s.handle,
        fqHandle: s.fqHandle,
        avatarUrl: s.avatarUrl,
        content: s.content ?? "",
        publishedMs: s.publishedMs,
        url: s.url,
      };
    }
  }

  return {
    onThisDay: serializedOnThisDay,
    posts: serializedPosts,
    parentsByUri,
    siteData: { ...siteData[0] },
    user,
  };
};

export default function Index() {
  const { onThisDay, posts, parentsByUri } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const scrollerBottom = useRef<HTMLDivElement | null>(null);
  const previousVisibility = useRef<boolean>(true);

  const [editState, setEditState] = useState<{
    isOn: boolean;
    id: string | null;
  }>({ isOn: false, id: null });

  const [postSearchResults, setPostSearchResults] = useState<Post[] | null>(null);
  const [siteNotification, setsiteNotification] = useState<{
    msg: string;
    visible: boolean;
  }>({ msg: "Loading", visible: false });

  const [postArray, alterPostArray] = useState<Post[]>([]);
  const [postCount, setPostCount] = useState<number>(0);
  const [loadMoreInView, setLoadMoreInView] = useState(false);

  const cb = (entries: IntersectionObserverEntry[]) => {
    const [entry] = entries;
    setLoadMoreInView(entry.isIntersecting);
  };

  const options = {
    root: null,
    rootMargin: "0px",
    threshold: 0.1,
  };

  useEffect(() => {
    if (!localStorage.guestUUID) localStorage.guestUUID = uuidv4();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(cb, options);
    if (scrollerBottom.current) observer.observe(scrollerBottom.current);
    if (!previousVisibility.current && loadMoreInView) {
      setsiteNotification({ msg: "Loading more posts", visible: true });
      fetcher.submit(
        { loadOffset: (postCount + 25).toString() },
        { method: "post", action: `/api/post/fetch?index` }
      );
      setPostCount(postCount + 25);
    }
    previousVisibility.current = loadMoreInView;
    return () => {
      if (scrollerBottom.current) observer.unobserve(scrollerBottom.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollerBottom, options]);

  useEffect(() => {
    const data = fetcher.data as { additionalPosts?: Post[] | null } | undefined;
    if (data?.additionalPosts) {
      const newPosts: Post[] = [...data.additionalPosts];
      alterPostArray((prev) => [...prev, ...newPosts]);
      data.additionalPosts = null;
      setsiteNotification({ ...siteNotification, visible: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher]);

  return (
    // h-feed wrapper: gives IndieWeb parsers (Bridgy, feed readers,
    // microformats.io) a canonical feed anchor for all the h-entry
    // PostCards inside. The hidden p-name + p-author h-card provide
    // feed-level metadata; individual entries still carry their own
    // p-author for single-post correctness.
    <div className="h-feed">
      <span style={{ display: "none" }}>
        <data className="p-name" value="Patrick Glendon McCullough" />
        <a className="p-author h-card" href="https://pg.mccullo.ug/h/about">
          Patrick Glendon McCullough
        </a>
      </span>
      <SearchBar
        alterPostArray={alterPostArray}
        setPostSearchResults={setPostSearchResults}
      />
      {postSearchResults && !postSearchResults.length ? (
        <PostCard
          post={null}
          editState={null}
          setEditState={null}
          title="Error"
          message="Sorry, no posts were found that matched your search. 😞"
        />
      ) : (
        ""
      )}
      {onThisDay?.length && !postSearchResults ? (
        <div className="onThisDay__label">On this Day</div>
      ) : (
        ""
      )}
      <div
        className={`onThisDay__wrapper ${
          onThisDay?.length ? "onThisDay__wrapper--display" : ""
        }`}
      >
        {!postSearchResults &&
          onThisDay?.map((thisDay: any) => (
            <PostCard
              key={thisDay._id}
              editState={editState}
              setEditState={setEditState}
              post={thisDay}
              parent={
                thisDay.inReplyTo ? parentsByUri?.[thisDay.inReplyTo] : null
              }
            />
          ))}
      </div>
      {!postSearchResults &&
        posts?.map((post: any) => (
          <PostCard
            key={post._id}
            editState={editState}
            setEditState={setEditState}
            post={post}
            parent={post.inReplyTo ? parentsByUri?.[post.inReplyTo] : null}
          />
        ))}
      {/* Using state here for infinite scroll loads. Ideally would push these
          into posts from loaderdata, but rerender resets the count to 25 */}
      {postArray?.map((post: any) => (
        <PostCard
          key={post._id}
          editState={editState}
          setEditState={setEditState}
          post={post}
          parent={post.inReplyTo ? parentsByUri?.[post.inReplyTo] : null}
        />
      ))}
      {!postSearchResults ? (
        <>
          <div ref={scrollerBottom}>&nbsp;</div>
          <div
            className={`site-notifications ${
              siteNotification.visible ? "site-notifications--active" : ""
            }`}
          >
            <div className="loader" />
            {siteNotification.msg}
          </div>
        </>
      ) : (
        ""
      )}
    </div>
  );
}
