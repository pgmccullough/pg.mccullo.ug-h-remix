import { useLoaderData } from "react-router";
import { useState } from "react";

interface VisitorDoc {
  _id?: string;
  firstSeen?: number;
  lastSeen?: number;
  lastIpData?: any;
  lastUserName?: string | null;
  ipData?: any[];
  ip?: string[];
  user?: Array<{ id?: string; user_name?: string } | null>;
  history?: Array<{ path?: string; timestamp?: number; referrer?: string }>;
}

function place(visitor: VisitorDoc): string {
  const d = visitor.lastIpData ?? visitor.ipData?.[visitor.ipData.length - 1];
  if (!d) return "?";
  const parts = [d.city, d.region_code, d.country_code]
    .filter((x) => typeof x === "string" && x.length);
  return parts.length ? parts.join(", ") : (d.country_name || "?");
}

function flag(visitor: VisitorDoc): string {
  const d = visitor.lastIpData ?? visitor.ipData?.[visitor.ipData.length - 1];
  return d?.location?.country_flag_emoji ?? "";
}

function lastPath(visitor: VisitorDoc): string {
  return visitor.history?.[visitor.history.length - 1]?.path ?? "/";
}

function whenLabel(ms?: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.round(diff / min)}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function identity(visitor: VisitorDoc): string {
  if (visitor.lastUserName) return visitor.lastUserName;
  const u = visitor.user?.find((x) => x?.user_name)?.user_name;
  if (u) return u;
  return "anon";
}

export const SiteActivity: React.FC<{}> = () => {
  const { visitors } = useLoaderData<{ visitors: VisitorDoc[] }>();
  // Collapsed by default — the drawer just shows its header tab at the
  // bottom of the screen until clicked.
  const [expanded, setExpanded] = useState<boolean>(false);

  const sorted = [...(visitors ?? [])].sort(
    (a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
  );

  return (
    <>
      <style>{`
        .siteActivity {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 360px;
          max-width: 90vw;
          z-index: 80;
          background: #fff;
          border: 1px solid #979997;
          border-bottom: 0;
          border-radius: 4px 4px 0 0;
          box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
          /* Header sits at the bottom; body grows upward above it. */
          display: flex;
          flex-direction: column-reverse;
          overflow: hidden;
        }
        .siteActivity__header {
          background: #eee;
          padding: 10px 14px;
          font-weight: 600;
          color: #506982;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          border-top: 1px solid #ddd;
          user-select: none;
        }
        .siteActivity__header:hover { background: #e6e6e6; }
        .siteActivity__caret {
          font-size: 1.25rem;
          color: #777;
          line-height: 1;
          transition: transform 0.15s ease;
        }
        /* "^" character points up by default; rotate when expanded so it
           points down, suggesting "click to collapse". */
        .siteActivity__caret--down { transform: rotate(180deg); }
        .siteActivity__body {
          max-height: 50vh;
          overflow-y: auto;
        }
        .siteActivity__row {
          padding: 8px 14px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 13px;
          line-height: 1.35;
        }
        .siteActivity__row:last-child { border-bottom: 0; }
        .siteActivity__line1 { color: #333; }
        .siteActivity__line2 { color: #888; font-size: 12px; }
        .siteActivity__path {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #4A6CBA;
        }
      `}</style>
      <section className="siteActivity">
        {/* Body first in JSX; column-reverse puts header visually below. */}
        {expanded && (
          <div className="siteActivity__body">
            {sorted.length === 0 ? (
              <div className="siteActivity__row" style={{ color: "#888" }}>
                No visits recorded yet.
              </div>
            ) : (
              sorted.map((v) => (
                <div key={String(v._id)} className="siteActivity__row">
                  <div className="siteActivity__line1">
                    <strong>{identity(v)}</strong>{" "}
                    {flag(v) && <span>{flag(v)} </span>}
                    {place(v)}
                  </div>
                  <div className="siteActivity__line2">
                    <span className="siteActivity__path">{lastPath(v)}</span>
                    {" · "}
                    {whenLabel(v.lastSeen)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        <header
          className="siteActivity__header"
          onClick={() => setExpanded(!expanded)}
        >
          <span>Recent visitors ({sorted.length})</span>
          <span
            className={`siteActivity__caret${expanded ? " siteActivity__caret--down" : ""}`}
          >
            ^
          </span>
        </header>
      </section>
    </>
  );
};
