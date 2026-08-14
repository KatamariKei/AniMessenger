import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AniMessengerApp } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "../app/globals.css";
import "./local.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AniMessengerApp />
    </ErrorBoundary>
  </StrictMode>,
);
