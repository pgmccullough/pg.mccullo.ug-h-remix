/**
 * Visitor detail page — /h/visitor/:visitorId
 *
 * Admin-only. Renders everything we've stored about a single visitor
 * document: identity signals, geo trail, tech fingerprint, and the
 * full history table. Clickable from each row in Recent visitors.
 */

import { useEffect } from "react";
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";
import type { LoaderFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

interface HistoryEntry {
  path?: string;
  referrer?: string;
  timestamp?: number;
  userAgent?: string;
  ip?: string;
}
interface VisitorDoc {
  _id: string;
  firstSeen?: number;
  lastSeen?: number;
  ip?: string[];
  ipData?: any[];
  lastIpData?: any;
  guestUUID?: string[];
  user?: Array<{ id?: string; user_name?: string } | null>;
  lastUserName?: string | null;
  userAgents?: string[];
  lastUserAgent?: string | null;
  lastAcceptLanguage?: string | null;
  viewports?: string[];
  lastViewport?: string | null;
  timezones?: string[];
  lastTimezone?: string | null;
  languages?: string[];
  lastLanguage?: string | null;
  /** Admin-assigned label overriding the automatic name display. */
  manualLabel?: string | null;
  history?: HistoryEntry[];
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") throw redirect("/h");

  const { visitorId } = params;
  if (!visitorId || !ObjectId.isValid(visitorId)) throw redirect("/h");

  const client = await clientPromise;
  const db = client.db("user_posts");
  const raw = await db
    .collection("myVisitors")
    .findOne({ _id: new ObjectId(visitorId) });
  if (!raw) throw redirect("/h");

  // Coerce _id to string so it survives the loader boundary.
  const visitor: VisitorDoc = {
    ...raw,
    _id: raw._id.toString(),
  } as any;

  return { visitor };
};

function fmtDate(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString();
}

function identityLabel(v: VisitorDoc): string {
  if (v.manualLabel) return v.manualLabel;
  if (v.lastUserName) return v.lastUserName;
  const u = v.user?.find((x) => x?.user_name)?.user_name;
  return u || "anon";
}

function placeLabel(d: any): string {
  if (!d) return "";
  const parts = [d.city, d.region_code, d.country_code].filter(
    (x) => typeof x === "string" && x.length
  );
  if (parts.length) return parts.join(", ");
  return d.country_name || d.country_code || "";
}

function shortUA(ua?: string): string {
  if (!ua) return "";
  // Try to pull out a friendly browser + OS descriptor. Falls back to
  // the raw string on unusual UAs.
  const browser =
    /Firefox\/[\d.]+/i.exec(ua)?.[0] ||
    /Edg\/[\d.]+/i.exec(ua)?.[0]?.replace("Edg", "Edge") ||
    /OPR\/[\d.]+/i.exec(ua)?.[0]?.replace("OPR", "Opera") ||
    /Chrome\/[\d.]+/i.exec(ua)?.[0] ||
    /Safari\/[\d.]+/i.exec(ua)?.[0] ||
    "";
  const os =
    /Windows NT [\d.]+/i.exec(ua)?.[0] ||
    /Mac OS X [\d_.]+/i.exec(ua)?.[0]?.replace(/_/g, ".") ||
    /Android [\d.]+/i.exec(ua)?.[0] ||
    /(iPhone|iPad); CPU (iPhone )?OS [\d_]+/i.exec(ua)?.[0]?.replace(/_/g, ".") ||
    /Linux/i.exec(ua)?.[0] ||
    "";
  return [browser, os].filter(Boolean).join(" · ") || ua;
}

export default function VisitorDetail() {
  const { visitor: v } = useLoaderData<{ visitor: VisitorDoc }>();

  const history = (v.history ?? []).slice().reverse(); // newest first
  const placeTrail = (v.ipData ?? [])
    .map((d) => placeLabel(d))
    .filter((x, i, arr) => x && arr.indexOf(x) === i); // unique in order
  const totalVisits = v.history?.length ?? 0;

  // Label editor — admin submits to /api/visitor/relabel; on success
  // we revalidate the loader so the new name replaces the old h1 +
  // pill without a hard refresh.
  const labelFetcher = useFetcher<{ ok?: boolean; label?: string; cleared?: boolean }>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (labelFetcher.state === "idle" && labelFetcher.data?.ok) {
      revalidator.revalidate();
    }
  }, [labelFetcher.state, labelFetcher.data]);

  return (
    <>
      <style>{`
        .vd { padding: 12px; font-family: 'PGM Sans', sans-serif; color: #333; }
        .vd h1 { font-size: 20px; margin: 0 0 8px; color: #506982; }
        .vd h2 { font-size: 14px; margin: 20px 0 6px; color: #506982;
          text-transform: uppercase; letter-spacing: 0.05em; }
        .vd__meta { font-size: 13px; color: #666; margin-bottom: 12px; }
        .vd__back {
          display: inline-block; margin-bottom: 10px;
          color: #4A6CBA; text-decoration: none; font-size: 12px;
        }
        .vd__back:hover { text-decoration: underline; }
        .vd__section {
          background: #fff;
          border: 1px solid #979997;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 14px;
        }
        .vd__section__body { padding: 10px 12px; }
        .vd__row {
          display: flex;
          gap: 12px;
          font-size: 13px;
          padding: 4px 0;
          border-bottom: 1px solid #f2f2f2;
        }
        .vd__row:last-child { border-bottom: 0; }
        .vd__row__k {
          flex: 0 0 130px; color: #888; font-weight: 600;
        }
        .vd__row__v { flex: 1; min-width: 0; word-break: break-word; }
        .vd__pill {
          display: inline-block;
          margin: 2px 4px 2px 0;
          padding: 2px 8px;
          background: #f3f3f3;
          border-radius: 999px;
          font-size: 12px;
        }
        .vd__hist {
          font-size: 12px;
          width: 100%;
          border-collapse: collapse;
        }
        .vd__hist th, .vd__hist td {
          text-align: left;
          padding: 6px 8px;
          border-bottom: 1px solid #f0f0f0;
          vertical-align: top;
        }
        .vd__hist th {
          background: #eee;
          color: #506982;
          font-weight: 600;
          font-size: 11px;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .vd__hist tr:last-child td { border-bottom: 0; }
        .vd__hist__path {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #4A6CBA;
        }
        .vd__hist__path:hover { text-decoration: underline; }
        .vd__hist__ref { color: #888; }
      `}</style>
      <div className="vd">
        <Link className="vd__back" to="/h">← Back to feed</Link>
        <h1>{identityLabel(v)}</h1>
        <div className="vd__meta">
          {totalVisits} visit{totalVisits === 1 ? "" : "s"}
          {" · "}first seen {fmtDate(v.firstSeen)}
          {" · "}last seen {fmtDate(v.lastSeen)}
        </div>

        {/* Label editor — admin picks a friendly name for this visitor
            (e.g. "Mom", "Googlebot", "roomate on the wifi"). Persists
            in Mongo, wins over lastUserName / "anon" everywhere. */}
        <div style={{
          background: "#fff",
          border: "1px solid #979997",
          borderRadius: 4,
          padding: 10,
          margin: "6px 0 14px",
        }} className="vd__label-editor">
          <labelFetcher.Form
            method="post"
            action="/api/visitor/relabel"
            style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
          >
            <input type="hidden" name="visitorId" value={v._id} />
            <label style={{ fontSize: 13, color: "#506982", fontWeight: 600 }}>
              Label:
            </label>
            <input
              // key ensures React unmounts + remounts on visitor change
              // so defaultValue is respected — otherwise the field
              // sticks to the last visitor's typed value.
              key={v._id}
              type="text"
              name="label"
              defaultValue={v.manualLabel ?? ""}
              maxLength={60}
              placeholder="e.g. Mom, Googlebot, roommate"
              style={{
                flex: 1,
                minWidth: 180,
                padding: "4px 8px",
                border: "1px solid #979997",
                borderRadius: 4,
                fontFamily: "'PGM Sans', sans-serif",
                fontSize: 13,
              }}
            />
            <button
              type="submit"
              disabled={labelFetcher.state !== "idle"}
              style={{
                padding: "6px 14px",
                background: "#4A6CBA",
                color: "#fff",
                border: 0,
                borderRadius: 4,
                cursor: labelFetcher.state !== "idle" ? "default" : "pointer",
                font: "600 12px 'PGM Sans', sans-serif",
                height: "auto",
                letterSpacing: "0.02em",
              }}
            >
              {labelFetcher.state !== "idle" ? "Saving…" : "Save"}
            </button>
            {v.manualLabel ? (
              <span style={{ fontSize: 11, color: "#888" }}>
                Leave blank + Save to clear
              </span>
            ) : null}
          </labelFetcher.Form>
        </div>
        <style>{`
          [data-theme="dark"] .vd__label-editor {
            background: #1a2028 !important;
            border-color: #2a3543 !important;
          }
          [data-theme="dark"] .vd__label-editor input[type="text"] {
            background: #232b36;
            color: #e5e7eb;
            border-color: #2a3543;
          }
        `}</style>

        <h2>Identity</h2>
        <div className="vd__section">
          <div className="vd__section__body">
            <Row k="Accounts">
              {v.user && v.user.length > 0
                ? v.user.map((u, i) =>
                    u ? (
                      <span key={i} className="vd__pill">
                        {u.user_name || u.id}
                      </span>
                    ) : null
                  )
                : <em style={{ color: "#888" }}>never signed in</em>}
            </Row>
            <Row k="Guest UUIDs">
              {v.guestUUID && v.guestUUID.length
                ? v.guestUUID.map((g, i) => (
                    <span key={i} className="vd__pill" title={g}>
                      {g.slice(0, 8)}…
                    </span>
                  ))
                : <em style={{ color: "#888" }}>none</em>}
            </Row>
            <Row k="IPs">
              {v.ip?.length
                ? v.ip.map((ip, i) => (
                    <span key={i} className="vd__pill">{ip}</span>
                  ))
                : "—"}
            </Row>
          </div>
        </div>

        <h2>Location trail</h2>
        <div className="vd__section">
          <div className="vd__section__body">
            <Row k="Last known">
              {placeLabel(v.lastIpData) || "unknown"}
            </Row>
            {placeTrail.length > 1 && (
              <Row k="All observed">
                {placeTrail.map((p, i) => (
                  <span key={i} className="vd__pill">{p}</span>
                ))}
              </Row>
            )}
          </div>
        </div>

        <h2>Fingerprint</h2>
        <div className="vd__section">
          <div className="vd__section__body">
            <Row k="Browser / OS">
              {shortUA(v.lastUserAgent ?? "") || "unknown"}
            </Row>
            <Row k="Accept-Language">
              {v.lastAcceptLanguage || "—"}
            </Row>
            <Row k="Language">
              {v.lastLanguage || "—"}
            </Row>
            <Row k="Viewport">
              {v.lastViewport || "—"}
            </Row>
            <Row k="Timezone">
              {v.lastTimezone || "—"}
            </Row>
            {v.userAgents && v.userAgents.length > 1 && (
              <Row k="All UAs">
                {v.userAgents.map((ua, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                    {shortUA(ua)}
                  </div>
                ))}
              </Row>
            )}
          </div>
        </div>

        <h2>Visit history ({history.length})</h2>
        <div className="vd__section">
          <table className="vd__hist">
            <thead>
              <tr>
                <th>When</th>
                <th>Path</th>
                <th>Referrer</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td>{fmtDate(h.timestamp)}</td>
                  <td>
                    {h.path ? (
                      <Link className="vd__hist__path" to={h.path}>
                        {h.path}
                      </Link>
                    ) : ""}
                  </td>
                  <td className="vd__hist__ref">
                    {h.referrer
                      ? (
                          <a
                            href={h.referrer}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "inherit" }}
                          >
                            {h.referrer}
                          </a>
                        )
                      : "—"}
                  </td>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                    {h.ip || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="vd__row">
      <div className="vd__row__k">{k}</div>
      <div className="vd__row__v">{children}</div>
    </div>
  );
}
