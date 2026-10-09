import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/instrument-sans";
import "@fontsource/jetbrains-mono/400.css";
import "./index.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
