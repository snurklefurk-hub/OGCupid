import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import {MemberSessionProvider} from "./MemberSessionProvider.jsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("OGC-L root element missing");

createRoot(root).render(
  <React.StrictMode>
    {/* Hash routing works at the independent /ogc-l/ preview URL without
        changing Render rewrite rules that still serve the legacy site. */}
    <HashRouter>
      <MemberSessionProvider>
        <App />
      </MemberSessionProvider>
    </HashRouter>
  </React.StrictMode>
);
