import { useEffect, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import {
  canEncodeForQr,
  encodeSharedList,
  toSharedList,
  type ShareListSource,
} from "../../domain/shareList";
import { shareShoppingList } from "../../domain/share";
import { trackEvent } from "../../services/analytics";

export type ShareListSheetProps = {
  open: boolean;
  source: ShareListSource | null;
  onClose: () => void;
};

type EncodeState =
  | { status: "idle" | "loading" }
  | { status: "ready"; url: string; payload: string; qrOk: boolean }
  | { status: "error"; message: string };

/** Parent sheet to share the current or saved list via link or local QR. */
export function ShareListSheet({ open, source, onClose }: ShareListSheetProps) {
  const [encoded, setEncoded] = useState<EncodeState>({ status: "idle" });
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setEncoded({ status: "idle" });
      setShowQr(false);
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
    void encodeSharedList(shared).then((result) => {
      if (cancel) return;
      if (!result.ok) {
        const message =
          result.code === "too-large"
            ? "Dit lijstje is te groot om te delen. Haal een paar producten weg en probeer opnieuw."
            : "Dit lijstje kon niet worden omgezet naar een link.";
        setEncoded({ status: "error", message });
        return;
      }
      setEncoded({ status: "ready", url: result.url, payload: result.payload, qrOk: canEncodeForQr(result.payload) });
    });
    return () => {
      cancel = true;
    };
  }, [open, source]);

  const qrSvg = useMemo(() => {
    if (encoded.status !== "ready" || !encoded.qrOk || !showQr) return null;
    try {
      return renderSVG(encoded.url, { ecc: "M", border: 2, pixelSize: 4 });
    } catch {
      return null;
    }
  }, [encoded, showQr]);

  async function shareNative() {
    if (encoded.status !== "ready" || busy) return;
    setBusy(true);
    try {
      const outcome = await shareShoppingList(encoded.url, {
        share: navigator.share?.bind(navigator),
        canShare: navigator.canShare?.bind(navigator),
        copy: (text) => navigator.clipboard.writeText(text),
      });
      if (outcome === "cancelled") return;
      trackEvent({ name: "shopping_list_shared", data: { method: outcome === "shared" ? "native" : "copied" } });
      if (outcome === "copied") {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } else {
        onClose();
      }
    } finally {
      setBusy(false);
    }
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

  function revealQr() {
    if (encoded.status !== "ready" || !encoded.qrOk) return;
    setShowQr(true);
    trackEvent({ name: "shopping_list_shared", data: { method: "qr" } });
  }

  return (
    <Sheet open={open} onClose={onClose} label="Deel dit lijstje">
      <div className="share-list" data-testid="share-list-sheet">
        <h2>Deel dit lijstje</h2>
        <p className="share-note">
          De link bevat de productnamen en aantallen. Dat is geen versleuteling: iedereen met de link kan het lijstje openen. Foto&apos;s en je
          voortgang gaan niet mee.
        </p>

        {encoded.status === "loading" && <p className="share-note">Link maken…</p>}
        {encoded.status === "error" && <p className="share-error" data-testid="share-list-error">{encoded.message}</p>}

        {encoded.status === "ready" && (
          <>
            <div className="share-list-actions">
              <PressButton type="button" variant="primary" wide data-testid="share-list-native" disabled={busy} onClick={() => void shareNative()}>
                Deel
              </PressButton>
              <PressButton type="button" variant="secondary" wide data-testid="share-list-copy" disabled={busy} onClick={() => void copyLink()}>
                {copied ? "Gekopieerd" : "Kopieer link"}
              </PressButton>
              {encoded.qrOk ? (
                <PressButton type="button" variant="quiet" wide data-testid="share-list-qr" onClick={revealQr}>
                  {showQr ? "QR-code" : "Toon QR-code"}
                </PressButton>
              ) : (
                <p className="share-note" data-testid="share-list-qr-too-big">
                  Te groot voor een QR-code — gebruik de link.
                </p>
              )}
            </div>
            {showQr && qrSvg && (
              <div className="share-qr" data-testid="share-list-qr-view" aria-label="QR-code van dit lijstje" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            )}
            {showQr && !qrSvg && (
              <p className="share-error">De QR-code kon niet worden gemaakt. Gebruik de link.</p>
            )}
          </>
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
