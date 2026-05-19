import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  server: {
    port: 3000,
  },
  ssr: {
    // Keep these server-only deps external so Vite doesn't try to bundle them
    noExternal: [],
  },
});
