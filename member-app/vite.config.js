import { defineConfig } from "vite";

// This is a standalone multi-page-safe static build. Render publishes /public.
// The member UI is generated into /public/account without overwriting the
// existing homepage, quizzes, or OGTrends content.
export default defineConfig({
  base: "./",
  build: {
    outDir: "../public/account",
    emptyOutDir: true,
    sourcemap: false,
  },
});
