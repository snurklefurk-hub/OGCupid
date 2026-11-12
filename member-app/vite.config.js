import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Build both entry points into the existing /public/account/ static directory.
// The member home contains auth, private profile and answer persistence;
// persona.html is a separately gated, signed-in-only quiz entry point.
export default defineConfig({
  base: "./",
  build: {
    outDir: "../public/account",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        persona: fileURLToPath(new URL("./persona.html", import.meta.url))
      },
    },
  },
});
