import { defineConfig } from "vite";

export default defineConfig({
  // Staging-only output. Neither /account/ nor the root site is overwritten.
  base: "/ogc-l/",
  build: {
    outDir: "../public/ogc-l",
    emptyOutDir: true,
    sourcemap: false
  }
});
