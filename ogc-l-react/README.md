# OGC-L React + Vite app-shell foundation

This is a **visual and architectural redesign preview**, not a live member app. The user explicitly selected React + Vite for OGC-L on November 17, 2026.

## Safety and staging
- Created off `OGC-lovable`, not `main`.
- `main` and `/account/` stay untouched; no rewrite or Render service change is performed.
- `npm run build` publishes only under `public/ogc-l/`.
- `http://localhost:5173/ogc-l/` during Vite development, or `/ogc-l/#/matches` when statically published.
- Built-in route navigation is preview-only. **No active authentication, member profile reads/writes, fictitious recommendations, or fabricated activity.**
- External links currently lead back to the legacy site; do not present this preview as complete.

## Run
```bash
cd ogc-l-react
npm install
npm test
npm run dev
npm run build
```

## Architectural intent
- One persistent React shell, 16%/68%/16% desktop layout, only center scrolls.
- Four primary destinations: MATCHES, MESSAGES, VISITORS, QUICKMATCH. Questions is a secondary view.
- Site design remains classic OkCupid-inspired; visual refinements will follow owner approval.
- React Router HashRouter is a **temporary staging choice** to avoid changing Render URL rewrites; switch to BrowserRouter with validated rewrite rules for production deep-link URLs.
- Neon Auth and the existing member API remain authoritative. Connect real, verified server data before exposing recommendations, profile progress, messages, or visitor activity.
- Keep API and domain services separate from presentation components.
- Future mobile packaging: evaluate Capacitor with the responsive React app; push notifications belong to a backend notification service and native push configuration, not a browser-only imitation.

## Next integration gates
1. Confirm independent preview CI build and inspect desktop/mobile visual output.
2. Add a narrow authenticated session provider, with JWT refresh and failure-closed states.
3. Reuse the existing discovery API for member cards; respect `matchPercent: null` and score confidence.
4. Port the existing nine-essay profile editor and question flow without changing persistence semantics.
5. Implement true app routes and Render rewrite rules only after authenticating direct URLs.
