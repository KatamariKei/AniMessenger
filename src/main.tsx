import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CharaSmsApp } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "../app/globals.css";
import "./local.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <CharaSmsApp />
    </ErrorBoundary>
  </StrictMode>,
);
