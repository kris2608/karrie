import { useEffect, useState } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { listShareCopy, shareLink } from "../../domain/share";
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
    const shared = source ? toSharedList(source) : { status: "error" as const, code: "empty" as const };
    if (shared.status !== "ok") {
      setEncoded({
        status: "error",
        message:
          shared.code === "too-many"
            ? "Dit lijstje bevat te veel producten om te delen. Verwijder een paar producten en probeer het opnieuw."
            : shared.code === "invalid"
              ? "Dit lijstje kan zo niet worden gedeeld. Verwijder vreemde producten en probeer opnieuw."
              : "Dit lijstje is leeg of kan niet worden gedeeld.",
      });
      return;
    }
    let cancel = false;
    setEncoded({ status: "loading" });
    void shareListClient.create(shared.list).then((result) => {
      if (cancel) return;
      if (result.status !== "ok") {
        const message =
          result.code === "rate-limited"
            ? "Je hebt te vaak gedeeld. Probeer het zo weer."
            : result.code === "empty"
              ? "Dit lijstje is leeg of kan niet worden gedeeld."
              : result.code === "too-many"
                ? "Dit lijstje bevat te veel producten om te delen. Verwijder een paar producten en probeer het opnieuw."
                : result.code === "invalid"
                  ? "Dit lijstje kan zo niet worden gedeeld. Verwijder vreemde producten en probeer opnieuw."
                  : "Deellink maken lukt nu niet. Controleer je internet en probeer het zo opnieuw.";
        setEncoded({ status: "error", message });
        return;
      }
      setEncoded({ status: "ready", url: result.url });
    });
    return () => {
      cancel = true;
    };
  }, [open, source]);

  async function share() {
    if (encoded.status !== "ready" || busy) return;
    setBusy(true);
    try {
      const copy = listShareCopy({
        name: source?.name,
        retailer: source?.retailer,
        itemCount: source?.items.length ?? 0,
      });
      const outcome = await shareLink(
        {
          share: navigator.share?.bind(navigator),
          canShare: navigator.canShare?.bind(navigator),
          copy: (text) => navigator.clipboard.writeText(text),
        },
        { title: copy.title, text: copy.text, url: encoded.url },
      );
      if (outcome === "cancelled") return;
      trackEvent({ name: "shopping_list_shared", data: { method: outcome === "shared" ? "native" : "copied" } });
      if (outcome === "copied") flashCopied();
    } finally {
      setBusy(false);
    }
  }

  function flashCopied() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function copyLink() {
    if (encoded.status !== "ready" || busy) return;
    setBusy(true);
    try {
      await navigator.clipboard.writeText(encoded.url);
      trackEvent({ name: "shopping_list_shared", data: { method: "copied" } });
      flashCopied();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Deel dit lijstje">
      <div className="share-list" data-testid="share-list-sheet">
        <h2>Deel dit lijstje</h2>
        <p className="share-note">
          We bewaren een kopie van dit lijstje 48 uur op de server. Iedereen met de link kan het openen. Eigen foto&apos;s blijven op dit apparaat; herkenbare winkel- of Open Food Facts-foto&apos;s kunnen bij de ontvanger opnieuw geladen worden. Je voortgang gaat niet mee.
        </p>

        {encoded.status === "loading" && <p className="share-note">Link maken…</p>}
        {encoded.status === "error" && (
          <p className="share-error" data-testid="share-list-error">
            {encoded.message}
          </p>
        )}

        {encoded.status === "ready" && (
          <div className="share-list-actions">
            <PressButton type="button" variant="primary" wide data-testid="share-list-share" disabled={busy} onClick={() => void share()}>
              Delen
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
