import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/nunito/latin-900.css";
import { App } from "./App";
import { captureInstallPrompt } from "./features/install/installPrompt";
import { startPwaUpdates } from "./pwa/register";
import { trackEvent } from "./services/analytics";
import { captureCampaignFromLocation } from "./services/campaignAttribution";
import { igBioDestination, igBioLandingEvent, isIgBioPath } from "./services/igBio";
import "./styles/tokens.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root ontbreekt");

// Render redirects /ig before the app loads. If the service worker already
// served this shell, send the browser on so capture sees the bio params.
if (isIgBioPath(window.location.pathname)) {
  window.location.replace(igBioDestination());
} else {
  captureInstallPrompt();
  captureCampaignFromLocation();
  const landing = igBioLandingEvent(window.location.search);
  if (landing) trackEvent(landing, "landing-view:ig");
  startPwaUpdates();

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
