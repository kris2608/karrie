import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Toast, type Notice } from "../components/ui/Toast";
import { useAdventure } from "../state/AdventureContext";
import { applyPendingUpdate, startPwaUpdates, subscribeUpdateReady } from "./register";
import { CELEBRATION_HOLD_MS, canApplyAppUpdate, shouldSkipReload, takeUpdateNotice } from "./updatePolicy";

let startupNotice: Notice | null | undefined;

function readStartupNotice(): Notice | null {
  if (startupNotice !== undefined) return startupNotice;
  const text = takeUpdateNotice(sessionStorage);
  startupNotice = text ? { id: 1, text } : null;
  return startupNotice;
}

export function PwaUpdate() {
  const location = useLocation();
  const { adventure } = useAdventure();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(readStartupNotice);
  const [celebrationSettled, setCelebrationSettled] = useState(false);

  useEffect(() => {
    startPwaUpdates();
    return subscribeUpdateReady(() => setReady(true));
  }, []);

  useEffect(() => {
    if (location.pathname !== "/klaar") {
      setCelebrationSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setCelebrationSettled(true), CELEBRATION_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (!ready) return;
    if (shouldSkipReload(sessionStorage, Date.now(), import.meta.env.VITE_APP_BUILD)) return;
    const safe = canApplyAppUpdate({
      path: location.pathname,
      phase: adventure?.phase ?? null,
      celebrationSettled,
    });
    if (!safe) return;
    void applyPendingUpdate();
  }, [ready, location.pathname, adventure?.phase, celebrationSettled]);

  return <Toast notice={notice} onDismiss={() => setNotice(null)} />;
}
