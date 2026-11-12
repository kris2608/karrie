/**
 * Chrome on Android fires `beforeinstallprompt` once the PWA can be installed.
 * The home card waits until the parent has opened Toevoegen or Controleren.
 */

const USED_KEY = "karrie-install-used";
const DISMISS_KEY = "karrie-install-dismissed";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let listening = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode */
  }
}

export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const media = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return media || ios;
}

/** True when the home card should offer install. */
export function installCardVisible(state: { hasPrompt: boolean; standalone: boolean; used: boolean; dismissed: boolean }): boolean {
  return state.hasPrompt && !state.standalone && state.used && !state.dismissed;
}

export function currentInstallVisible(): boolean {
  return installCardVisible({
    hasPrompt: deferred !== null,
    standalone: isStandaloneApp(),
    used: readFlag(USED_KEY),
    dismissed: readFlag(DISMISS_KEY),
  });
}

export function captureInstallPrompt() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

/** Remember that Toevoegen or Controleren was opened on this device. */
export function markAppUsed() {
  writeFlag(USED_KEY);
  emit();
}

export function dismissInstallOffer() {
  writeFlag(DISMISS_KEY);
  emit();
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  emit();
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === "dismissed") dismissInstallOffer();
  else emit();
}
