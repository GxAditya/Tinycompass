// Never set ssr.external or resolve.external: the server bundle has no runtime module resolution,
// so the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    }),
    viteReact(),
    ...(command === "build"
      ? [
          nitro({
            // Cloudflare Workers (free plan): 3 MB compressed script limit, so minify the bundle.
            preset: "cloudflare-module",
            minify: true,
            compatibilityDate: "2026-11-01",
            cloudflare: { wrangler: { name: "tinycompass" } },
          }),
        ]
      : []),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
}));
