import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/nunito/latin-900.css";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root ontbreekt");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
