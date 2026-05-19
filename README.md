# pg.mccullo.ug/h/

A personal site / private social feed. For visitors: a Facebook-style chronological feed of "postcards" with infinite scroll, image/video/audio/link-preview cards, emoji reactions, comments, an "On This Day" rail spanning 25 years of imported posts, and a Stories row at the top. For me as admin: in-page tools for posting, editing, calendar, notes, wishlist, and an email client (currently dormant).

## Stack

React Router v7 (framework mode, SSR) on Vercel, with React 19, TypeScript, Vite. MongoDB for data, S3 for media, Pusher for real-time channels, Postmark for inbound/outbound email. Lexical for the in-page rich-text editor.

## Local development

```bash
cp example.env .env       # fill in the values
npm install
npm run dev               # http://localhost:3000
```

Other scripts:
```bash
npm run typecheck         # tsc --noEmit (run after `react-router typegen`)
npm run build             # react-router build
npm run start             # serve the build with @react-router/serve
npm run sass              # SCSS watcher
```

## Deployment

Pushes to `main` auto-deploy to Vercel via the GitHub integration. Push to any other branch to get a preview deployment. The `@vercel/react-router` preset (configured in `react-router.config.ts`) handles the build output format Vercel expects — no `vercel.json` needed.

## Notes on history

This repo was originally a Remix v1 app (initially intended for AWS Architect, then run on a plain Node/Express server). It was migrated to React Router v7 framework mode in May 2026 — see `MIGRATION_NOTES.md` for the details.

Constant work in progress. Feel free to copy/steal as much of this as you like.
