import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  server: {
    port: 3000,
  },
  ssr: {
    // These packages ship CommonJS-only (or have an `exports` field that
    // doesn't expose the named exports we use). When Vite leaves them as
    // bare external imports in the SSR bundle, Node's ESM loader trips
    // on the named-import syntax. Telling Vite to bundle them ourselves
    // lets Vite handle the CJS<->ESM interop properly.
    noExternal: [
      "browser-image-resizer",
      "exifr",
      "pusher",
      "pusher-js",
      "bcryptjs",
      "postmark",
    ],
  },
});
