import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!, {
  onRecoverableError(error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const summary = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("BestScout recovered from a render error", summary, error, cause);
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
