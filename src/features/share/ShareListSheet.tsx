import { useEffect, useState } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { whatsAppShareUrl } from "../../domain/share";
import { toSharedList, type ShareListSource } from "../../domain/shareList";
import { trackEvent } from "../../services/analytics";
import { shareListClient } from "../../services/shareList/client";

export type ShareListSheetProps = {
  open: boolean;
  source: ShareListSource | null;
  onClose: () => void;
};

type EncodeState =
  | { status: "idle" | "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

/** Parent sheet to share the current or saved list via a temporary short link. */
export function ShareListSheet({ open, source, onClose }: ShareListSheetProps) {
  const [encoded, setEncoded] = useState<EncodeState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setEncoded({ status: "idle" });
      setCopied(false);
      setBusy(false);
      return;
    }
    trackEvent({ name: "shopping_list_share_opened" });
    const shared = source ? toSharedList(source) : null;
    if (!shared) {
      setEncoded({ status: "error", message: "Dit lijstje is leeg of kan niet worden gedeeld." });
      return;
    }
    let cancel = false;
    setEncoded({ status: "loading" });
    void shareListClient.create(shared).then((result) => {
      if (cancel) return;
      if (result.status !== "ok") {
        const message =
          result.code === "rate-limited"
            ? "Je hebt te vaak gedeeld. Probeer het zo weer."
            : result.code === "empty"
              ? "Dit lijstje is leeg of kan niet worden gedeeld."
              : "Deellink maken lukt nu niet. Probeer het zo opnieuw.";
        setEncoded({ status: "error", message });
        return;
      }
      setEncoded({ status: "ready", url: result.url });
    });
    return () => {
      cancel = true;
    };
  }, [open, source]);

  function shareWhatsApp() {
    if (encoded.status !== "ready" || busy) return;
    trackEvent({ name: "shopping_list_shared", data: { method: "whatsapp" } });
    window.open(whatsAppShareUrl(encoded.url), "_blank", "noopener,noreferrer");
  }

  async function copyLink() {
    if (encoded.status !== "ready" || busy) return;
    setBusy(true);
    try {
      await navigator.clipboard.writeText(encoded.url);
      trackEvent({ name: "shopping_list_shared", data: { method: "copied" } });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Deel dit lijstje">
      <div className="share-list" data-testid="share-list-sheet">
        <h2>Deel dit lijstje</h2>
        <p className="share-note">
          We bewaren een kopie van dit lijstje 48 uur op de server. Iedereen met de link kan het openen. Foto&apos;s en je voortgang gaan niet mee.
        </p>

        {encoded.status === "loading" && <p className="share-note">Link maken…</p>}
        {encoded.status === "error" && (
          <p className="share-error" data-testid="share-list-error">
            {encoded.message}
          </p>
        )}

        {encoded.status === "ready" && (
          <div className="share-list-actions">
            <PressButton type="button" variant="primary" wide data-testid="share-list-whatsapp" disabled={busy} onClick={shareWhatsApp}>
              Deel via WhatsApp
            </PressButton>
            <PressButton type="button" variant="secondary" wide data-testid="share-list-copy" disabled={busy} onClick={() => void copyLink()}>
              {copied ? "Link gekopieerd!" : "Kopieer link"}
            </PressButton>
          </div>
        )}

        <div className="sheet-actions">
          <PressButton type="button" variant="quiet" wide onClick={onClose}>
            Sluiten
          </PressButton>
        </div>
      </div>
    </Sheet>
  );
}
