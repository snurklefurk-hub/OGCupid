import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {migrateBrowserLocation} from "./browser-location.mjs";
import App from "./App.jsx";
import {MemberSessionProvider} from "./MemberSessionProvider.jsx";
import "./styles.css";
import "./period-tabs.css";

// Normalize bookmarked /#/ URLs and static-host deep-link recovery before
// React Router chooses its initial page. Do not reload for canonicalization.
migrateBrowserLocation(window,import.meta.env.BASE_URL);

const root = document.getElementById("root");
if (!root) throw new Error("OGC-L root element missing");

createRoot(root).render(
  <React.StrictMode>
    {/* Canonical, shareable paths; the static build supplies direct route entries. */}
    <BrowserRouter basename={import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL}>
      <MemberSessionProvider>
        <App />
      </MemberSessionProvider>
    </BrowserRouter>
  </React.StrictMode>
);
