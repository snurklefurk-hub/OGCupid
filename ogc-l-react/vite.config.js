import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The same React app has two isolated targets:
// - /ogc-l/ when previewed beneath an existing static site's public folder.
// - / when deployed as its OWN Render static site.
const base = process.env.OGCL_DEPLOY_BASE || "/ogc-l/";
if (!/^(\/|\/[a-z0-9-]+\/)$/i.test(base)) {
  throw new Error("Invalid OGC-L deploy base; use / or a single named subpath.");
}

export default defineConfig({
  base,
  plugins: [{
    name: "ogcl-brand-asset",
    apply: "build",
    closeBundle() {
      // Copy only the approved logo; don't expose the entire legacy public
      // directory (including unrelated legacy pages) on staging.
      const source = fileURLToPath(new URL("../public/brand/ogcupid-logo-white.png", import.meta.url));
      const destination = fileURLToPath(new URL("../public/ogc-l/brand/ogcupid-logo-white.png", import.meta.url));
      mkdirSync(fileURLToPath(new URL("../public/ogc-l/brand/", import.meta.url)), {recursive:true});
      copyFileSync(source, destination);
      // Publish the existing owner-curated 410 question definitions unchanged,
      // rather than shipping a new/generated copy or maintaining two banks.
      const questionSource = fileURLToPath(new URL("../public/questions/question-bank.js", import.meta.url));
      const questionDirectory = fileURLToPath(new URL("../public/ogc-l/questions/", import.meta.url));
      mkdirSync(questionDirectory, {recursive:true});
      copyFileSync(questionSource, fileURLToPath(new URL("../public/ogc-l/questions/question-bank.js", import.meta.url)));
    }
  }],
  build: {
    // Render staging publish path: public/ogc-l
    // This never overwrites legacy main/index, member-app or public/account.
    outDir: "../public/ogc-l",
    emptyOutDir: true,
    sourcemap: false
  }
});
