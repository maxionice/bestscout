import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!, {
  onRecoverableError(error) {
    const cause = error instanceof Error ? error.cause : undefined;
    console.error("BestScout recovered from a render error", error, cause);
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
