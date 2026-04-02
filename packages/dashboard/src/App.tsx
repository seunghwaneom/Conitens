import React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ForwardShell } from "./components/ForwardShell.js";

export function App() {
  return (
    <ErrorBoundary>
      <ForwardShell />
    </ErrorBoundary>
  );
}
