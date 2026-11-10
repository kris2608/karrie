import { Karrie } from "./mascot/Karrie";
import { PressButton } from "./ui/PressButton";

type Props = {
  onRetry: () => void;
  busy?: boolean;
};

/** Blocking screen when IndexedDB cannot be opened or read safely. */
export function StorageLoadError({ onRetry, busy }: Props) {
  return (
    <div className="storage-error" data-testid="storage-load-error" role="alert">
      <Karrie mood="idle" className="storage-error-mascot" />
      <p className="storage-error-text">
        Karrie kan je lijstjes even niet openen. Je gegevens zijn niet gewist. Probeer opnieuw.
      </p>
      <PressButton variant="primary" wide disabled={busy} data-testid="storage-retry" onClick={onRetry}>
        {busy ? "Bezig…" : "Opnieuw proberen"}
      </PressButton>
    </div>
  );
}
