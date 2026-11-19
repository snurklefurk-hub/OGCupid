import { defineConfig } from "vite";
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The same React app has two isolated targets:
// - /ogc-l/ when previewed beneath an existing static site's public folder.
// - / when deployed as its OWN Render static site.
// Production publish keeps all legacy /account, /quiz, /ogtrends and legal
// resources available during the React cutover. Never empty public/.
const productionRoot = process.env.OGCL_PRODUCTION_ROOT === "true";
const previewBase = process.env.OGCL_DEPLOY_BASE || "/ogc-l/";
const base = productionRoot ? "/" : previewBase;
if (!/^(\/|\/[a-z0-9-]+\/)$/i.test(base)) {
  throw new Error("Invalid OGC-L deploy base; use / or a single named subpath.");
}

export default defineConfig({
  base,
  plugins: [{
    name: "ogcl-brand-asset",
    apply: "build",
    closeBundle() {
      // In production these shared files already exist under public/.
      // Copying to the same path is unnecessary; never touch other legacy assets.
      if (productionRoot) return;
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
      // The native React onboarding city picker queries the existing verified
      // GeoNames shard files. Stage only the public reference data; never ship
      // private member coordinates or database credentials.
      const locationsSource=fileURLToPath(new URL("../public/locations/",import.meta.url));
      const locationsTarget=fileURLToPath(new URL("../public/ogc-l/locations/",import.meta.url));
      cpSync(locationsSource,locationsTarget,{recursive:true});
    }
  }],
  build: {
    // Render staging publish path: public/ogc-l
    // This never overwrites legacy main/index, member-app or public/account.
    ...(productionRoot
      ? {outDir: "../public", emptyOutDir: false}
      : {outDir: "../public/ogc-l", emptyOutDir: true}),
    sourcemap: false
  }
});
