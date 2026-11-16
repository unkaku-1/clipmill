import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/**
 * Fontsource CSS lists both woff2 and woff sources for every glyph slice.
 * Every browser that can run ClipMill (WebCodecs) supports woff2, so we strip the
 * legacy woff entries to roughly halve the size of the published font files.
 */
function woff2Only(): Plugin {
  return {
    name: "clipmill-woff2-only",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@fontsource") || !id.endsWith(".css")) return null;
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, "");
    },
  };
}

// BASE_PATH lets the same build run at "/" (Manus, Docker) or "/clipmill/" (GitHub Pages).
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [woff2Only(), react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
});
