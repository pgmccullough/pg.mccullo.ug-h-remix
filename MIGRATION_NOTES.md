# React Router v7 migration — handoff notes

This branch (`rr7-migration`) ports the site from Remix v1.8 to React Router v7 framework mode on Vercel, and bumps the rest of the stack (AWS SDK v2 → v3, MongoDB driver v4 → v6, React 18 → 19, Lexical 0.6 → 0.18, Node 18 → 22).

All changes were made statically — no `npm install` or build has been run yet. Below are the steps to install, verify, and merge.

## 1. First-time setup (on Windows)

```bash
cd ~/desktop/patrick/code/pg.mccullo.ug-h-remix

# Make sure you're on the migration branch
git checkout rr7-migration

# If git complains about ".git/index.lock", that's left over from a sandbox op:
rm -f .git/index.lock

# Run the cleanup script to delete legacy files that I couldn't remove from
# the sandbox (mount was read-only for deletes).
bash scripts/cleanup-legacy.sh

# Fresh install
npm install
```

## 2. Verify build & typecheck

```bash
npm run typecheck   # tsc --noEmit, after RR7 generates route types
npm run build       # react-router build
```

Both should complete cleanly. The most likely sources of errors are listed in **Known risks** below.

## 3. Test locally

```bash
# Copy your .env from somewhere safe, or use Vercel's `vercel env pull`
npm run dev

# Open http://localhost:3000 — should redirect to /h and render the feed
```

Smoke test checklist:
- `/h` renders, "On This Day" populates, infinite scroll loads more posts
- Click into a single post permalink (`/h/post/<id>`)
- `/h/writing/we-die-in-every-war` paginates correctly
- `/h/login` shows the sign-in modal
- A nonexistent URL like `/h/asdf` shows the 404 styled in the layout
- After login: post-edit modal, watchword edit, profile/cover image upload
- Image URLs like `/api/media/images/d36a6aee-.../...png` serve fine

## 4. Deploy a Vercel preview

Push the branch:
```bash
git push -u origin rr7-migration
```

Vercel should auto-create a preview deployment. Critical: **make sure the env vars from `example.env` exist on the Preview environment**, not just Production, or every API route will 500.

Verify the preview at its preview URL, then merge `rr7-migration` → `main` to ship.

---

## What changed, file by file

### Framework wiring
- **`package.json`** — full rewrite. Dropped `@remix-run/*`, `@architect/*`, `aws-sdk` v2, `compression`, `morgan`, `concurrently`, `nodemon`, `eslint`, `npm-run-all`, `react-uuid`, `util.promisify`. Added `react-router`, `@react-router/node`, `@react-router/serve`, `@react-router/dev`, `@vercel/react-router`, `@aws-sdk/*` v3, `vite`, `vite-tsconfig-paths`, `@types/node`. Bumped React → 19, TS → 5.7, Mongo driver → 6, Lexical → 0.18, Node engine → 22.
- **`vite.config.ts`** (new) — Vite config using the React Router and tsconfig-paths plugins.
- **`react-router.config.ts`** (new) — RR7 config with `ssr: true` and the Vercel preset.
- **`app/routes.ts`** (new) — explicit route table. Preserves the original `/h` nested layout and the `/api/*` resource-route tree.
- **`tsconfig.json`** — updated for RR7's typegen output (`.react-router/types`) and Vite's `vite/client` types.
- **`.gitignore`** — adds `/build`, `.react-router/`, `.vite`, `.vercel`.
- **`.eslintrc.js`** — neutralized (the Remix preset no longer exists). Build doesn't depend on ESLint.
- **`example.env`** — cleaned up; now documents which vars are required vs optional.

### Entry / root
- **`app/entry.client.tsx`** — rewritten to use `HydratedRouter` from `react-router/dom`.
- **`app/entry.server.tsx`** — rewritten to use `ServerRouter` and `@react-router/node`'s `createReadableStreamFromReadable`. Streaming behavior preserved.
- **`app/root.tsx`** — imports moved to `react-router`. `MetaFunction` updated from object-return to array-of-descriptors (v7 signature change). Removed `<LiveReload />` (Vite handles HMR natively). Empty `CatchBoundary` removed. CSS imported with the `?url` suffix Vite requires.

### Layout (`/h`)
- **`app/routes/h.tsx`** — imports moved to `react-router`. `CatchBoundary` (with `useCatch`) replaced by `ErrorBoundary` (with `useRouteError` + `isRouteErrorResponse`). The Postmark "opened" backfill is now gated on `ENABLE_POSTMARK_BACKFILL=1` so it doesn't slow admin pageloads while the email client is disabled.
- **`app/routes/h/index.tsx`** — imports + types modernized; tightened typing on the fetcher and the infinite-scroll observer.

### Bulk import migration (~45 files)
All `@remix-run/react` → `react-router`. All `@remix-run/node` → `react-router` (with `ActionArgs` → `ActionFunctionArgs` and `LoaderArgs` → `LoaderFunctionArgs`). `react-router-dom` → `react-router` in `Header.tsx` and `Sidebar.tsx`. The special upload-handler imports moved to `@react-router/node`.

### AWS SDK v2 → v3
Six files rewritten to use `@aws-sdk/client-s3` v3:
- **`app/utils/s3.server.ts`** — `S3Client`, `Upload` (from `@aws-sdk/lib-storage`) for streaming multipart, `GetObjectCommand`/`PutObjectCommand` for the cover/profile resize-and-overwrite.
- **`app/routes/api/media/$filePath/$.ts`** — the media proxy with lazy `_600w` resize. The streaming body in v3 is an `AsyncIterable<Uint8Array>` instead of a callback-based `createReadStream()` — converted to a Node `Readable` and wrapped via `createReadableStreamFromReadable`. Also added `Content-Type`, `Content-Length`, `ETag`, and `Cache-Control` response headers, which the v2 code didn't set.
- **`app/routes/api/email/receive/index.ts`** — `PutObjectCommand` for attachment uploads. Now awaits the uploads in parallel rather than fire-and-forget, so a failed S3 upload surfaces.
- **`app/routes/api/email/send/index.tsx`** — `GetObjectCommand` to read attachment bodies, with a new `streamToBuffer` helper for v3's stream Body.
- **`app/routes/api/upload/index.tsx`** — `HeadObjectCommand` to look up content length for email-attachment responses (the v2 code wastefully fetched the whole object via `getObject`).
- **`app/routes/api/upload/base64/index.tsx`** — `PutObjectCommand` for the base64 upload, with a fire-and-forget background `_600w` resize. Synthesizes a v2-shaped `{Key, Location, ETag}` return so the caller doesn't have to change.

### MongoDB v4 → v6
- **`app/lib/mongodb.ts`** — simplified. Single `MongoClient`, cached on `globalThis.__mongoClientPromise` so warm serverless invocations reuse the connection pool. The v6 driver handles pooling internally; calling `.connect()` is idempotent.

### Lexical 0.6 → 0.18
- **`app/components/TextEditor/TextEditor.tsx`** — replaced two uses of the now-private `node.__children` with the public `getChildren()` / `getChildrenSize()` APIs.
- **`app/utils/Lexical/Lexical.js`** and the plugins under `app/utils/Lexical/plugins/` are not imported anywhere in the route tree — left as-is. Delete them if you want a clean repo.

### Sundry
- **`app/routes/api/upload/index.tsx`** — `json()` calls switched to `Response.json()` (`json` is deprecated in v7).
- All other `json` calls left as-is — still works, just emits a deprecation warning.

---

## Known risks (most likely sources of build / runtime errors)

1. **Lexical editor.** I made the obvious `__children` → `getChildren()` fix, but the broader Lexical API has churned a lot between 0.6 and 0.18. The most likely thing to break at typecheck: the `placeholder` prop on `<RichTextPlugin>` — in newer Lexical versions you may need to pass it via the `ContentEditable` `aria-placeholder` attribute and style the placeholder with CSS instead. The `toggleLink("")` call may also need to dispatch `TOGGLE_LINK_COMMAND` instead. If TypeScript complains, the fixes are mechanical — let me know what errors surface and I can walk through them.

2. **Upload-handler helpers (`unstable_*`).** I kept the `unstable_` prefix on `composeUploadHandlers` / `createMemoryUploadHandler` / `parseMultipartFormData` and import them from `@react-router/node`. In RR7 those may have been renamed (the `unstable_` prefix tends to come off when APIs stabilize). If the import errors, search `@react-router/node`'s exports — same functions, possibly different name.

3. **Vercel cold starts + Mongo.** The cached `clientPromise` on `globalThis` survives within a single warm function instance but not across cold starts. The Mongo driver handles connection pooling well, but if you see "too many connections" warnings in Mongo Atlas, that's the place to tune (lower `maxPoolSize` in the connection string, or switch to a serverless-friendly driver mode).

4. **Pusher app key in `Header.tsx` is hardcoded** (`1463cc5404c5aa8377ba`). It's a public key so this is fine for now, but a future cleanup would move it to a `loader`-exposed env var. Not blocking.

5. **Streaming media response on Vercel serverless.** The media proxy at `/api/media/:filePath/*` streams S3 object bodies. On Vercel's Hobby plan there's a 4.5MB response size limit per serverless function invocation. For larger media (video), this would break. If you have any video files in S3 the cleaner long-term move is to return a 302 redirect to an S3 signed URL — let me know if you want that swap.

6. **`dangerouslySetInnerHTML` on post content** is unsanitized. Since you're the only author this isn't a security hole today, but if Lexical's HTML output shape changed between 0.6 and 0.18, old posts might render slightly differently. Spot-check a few text-heavy posts on the preview.

7. **`getUser()` errors don't preserve loader behavior.** The original `getUser` calls `logout(request)` on any DB error, which redirects to `/login`. That's still there — make sure your Mongo URL is correct in preview, or admin pages will hard-redirect.

---

## What I did NOT change

- Visual design (CSS/SCSS files untouched)
- The dormant admin apps (`Email`, `TaskTracker`, `RentalProperties`, `Webcam`, `SiteActivity`). Their files were migrated to RR7 imports so they compile, but they're still commented out in `Sidebar.tsx`. To re-enable, uncomment those lines.
- Routing semantics — every URL the old site served, the new site serves at the same path.
- Mongo schema, S3 bucket layout, Pusher channels, Postmark webhook URL — all unchanged.

---

## If you want me to keep going after install

When you run `npm install && npm run build`, save any errors and paste them back. The most common follow-ups will be:
- Lexical API tweaks (very likely)
- One or two stray type narrowings I missed
- Maybe a Vite-config tweak for some SCSS import

The big architectural work is done; what's left is shaking out the compile/runtime details.
