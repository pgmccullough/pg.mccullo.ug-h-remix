import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  server: {
    port: 3000,
  },
  ssr: {
    // CJS-only server-side packages whose named exports don't resolve over
    // Node's strict ESM loader unless Vite bundles them itself.
    //
    // NOTE: browser-only libraries (pusher-js, browser-image-resizer) must
    // NOT be listed here — bundling them into the SSR output would cause
    // them to reference browser globals like `self` at server load time
    // and crash with "self is not defined". Those are loaded via dynamic
    // import() inside client-only code paths (useEffect / event handlers).
    noExternal: [
      "exifr",
      "bcryptjs",
      "postmark",
      "pusher",
      // Fedify and its sub-packages — keeps the ActivityPub stack bundled
      // into the SSR output so Vercel's Node runtime resolves it cleanly.
      "@fedify/fedify",
      // Bluesky's @atproto packages — bundled for the same reason.
      "@atproto/api",
    ],
  },
});
