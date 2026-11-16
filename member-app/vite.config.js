import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

// Build both entry points into the existing /public/account/ static directory.
// The member home contains auth, private profile and answer persistence;
// persona.html is a separately gated, signed-in-only quiz entry point.
// The generated Vite CSS bundle is normally appended after links from the
// source HTML. Preserve the approved sitewide 2011 layer as the final sheet
// so future member-app rebuilds do not silently undo visual overrides.
const keep2011ThemeLast = {
  name: "ogc-2011-theme-last",
  apply: "build",
  closeBundle() {
    const theme = '<link rel="stylesheet" href="/okc-2011.css?v=1">';
    for (const name of ["index.html", "persona.html"]) {
      const filename = fileURLToPath(new URL("../public/account/" + name, import.meta.url));
      const html = readFileSync(filename, "utf8");
      const count = html.split(theme).length - 1;
      if (count !== 1) throw new Error("Theme reference missing or duplicated in " + name);
      const updated = html.replace(theme, "").replace("</head>", "  " + theme + "\n</head>");
      if (updated === html) continue;
      writeFileSync(filename, updated, "utf8");
    }
  }
};
export default defineConfig({
  plugins: [keep2011ThemeLast],
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
