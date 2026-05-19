import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  // Enable Server-Side Rendering (same behavior the Remix v1 app had).
  ssr: true,
  // Vercel preset: builds output the Vercel adapter expects, so deployments
  // work with no further config.
  presets: [vercelPreset()],
} satisfies Config;
