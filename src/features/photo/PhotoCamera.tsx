import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Karrie } from "../../components/mascot/Karrie";
import { PressButton } from "../../components/ui/PressButton";
import { buzz } from "../../feedback/haptics";
import { spring } from "../../motion/variants";
import { BarcodeHighlight } from "./BarcodeHighlight";
import { capturePhoto, type ProcessedPhoto } from "./imageProcessing";
import { useBarcode, type BarcodeSighting } from "./useBarcode";
import { useCamera, type CameraProblem } from "./useCamera";

/** looking: a code was read and is being looked up; unknown: nobody knows it; failed: the lookup did not work. */
export type BarcodeStatus = "looking" | "unknown" | "failed" | null;

type PhotoCameraProps = {
  title: string;
  /** Replaces the scan instruction, for example a search idea for the child. */
  hint?: string;
  /** True when the shutter only stores the photo on this device. */
  localOnly: boolean;
  busy: boolean;
  slow: boolean;
  preview: string | null;
  /** Read barcodes from the live preview; off for a photo of a product already on the list. */
  scanBarcodes: boolean;
  barcodeStatus: BarcodeStatus;
  /** The product just added with "Toevoegen en verder scannen"; shown briefly instead of the hint. */
  added?: { text: string; token: number } | null;
  onBarcode: (ean: string) => void;
  /** Fill it in by hand, keeping the scanned code. */
  onManual: () => void;
  onCapture: (photo: ProcessedPhoto) => void;
  onGallery: () => void;
  onClose: () => void;
};

const BARCODE_TEXT: Record<Exclude<BarcodeStatus, null>, string> = {
  looking: "Streepjescode gevonden…",
  unknown: "Onbekende streepjescode. Maak een foto van de voorkant.",
  failed: "Opzoeken lukt nu niet. Maak een foto van de voorkant.",
};

type CameraStatus = "opening" | "live" | "capturing" | CameraProblem;

export function PhotoCamera({ title, hint, localOnly, busy, slow, preview, scanBarcodes, barcodeStatus, added, onBarcode, onManual, onCapture, onGallery, onClose }: PhotoCameraProps) {
  const reduced = useReducedMotion() ?? false;
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<CameraStatus>("opening");
  const [attempt, setAttempt] = useState(0);
  const [sighting, setSighting] = useState<BarcodeSighting | null>(null);
  const problem = status === "denied" || status === "unavailable";

  const track = useCamera({
    videoRef,
    active: !busy && !problem,
    session: attempt,
    onReady: () => setStatus((current) => (current === "capturing" ? current : "live")),
    onProblem: setStatus,
  });

  const scanning = scanBarcodes && status === "live" && !busy;
  useBarcode({ videoRef, active: scanning, session: attempt, onDetect: onBarcode, onSighting: setSighting });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function shoot() {
    const video = videoRef.current;
    if (!video || status !== "live" || busy) return;
    setStatus("capturing");
    buzz(12);
    try {
      onCapture(await capturePhoto(video, track.current, frameRef.current));
    } catch {
      setStatus("opening");
      setAttempt((value) => value + 1);
    }
  }

  function retry() {
    setStatus("opening");
    setAttempt((value) => value + 1);
  }

  return (
    <motion.div
      className="scanner camera"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="camera"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <header className="scanner-bar">
        <h2 className={scanBarcodes ? "sr-only" : undefined}>{title}</h2>
        <button type="button" className="round-button round-s scanner-close" aria-label="Sluit camera" data-testid="camera-close" disabled={busy} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="scanner-frame camera-frame" ref={frameRef}>
        {problem ? (
          <CameraHelp denied={status === "denied"} onRetry={retry} onGallery={onGallery} />
        ) : (
          <>
            <video ref={videoRef} className="scanner-video" playsInline muted autoPlay aria-hidden="true" />
            {preview && busy && (
              <span className="camera-still-guide" aria-hidden="true">
                <img className="camera-still" src={preview} alt="" />
              </span>
            )}
            <span className={sighting || barcodeStatus === "looking" ? "scanner-corners is-detecting" : "scanner-corners"} aria-hidden="true" />
            {scanning && <BarcodeHighlight frameRef={frameRef} sighting={sighting} confirmed={barcodeStatus === "looking"} />}
          </>
        )}
        {busy && (
          <span className="scanner-busy" role="status" data-testid="photo-wait">
            <span className="scanner-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Karrie kijkt goed…
            {slow && <small className="camera-slow">Karrie wordt even wakker. De eerste foto kan een halve minuut duren.</small>}
          </span>
        )}
      </div>

      <div className="scanner-message" aria-live="polite">
        {!problem && !busy && !(scanBarcodes && barcodeStatus) && added && (
          <motion.p
            key={added.token}
            className="camera-added"
            data-testid="camera-added"
            initial={reduced ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {added.text}
          </motion.p>
        )}
        {!problem && !busy && !(scanBarcodes && barcodeStatus) && !added && (
          <div className="scanner-hint-block">
            <p className="scanner-hint" data-testid="camera-hint">
              {hint ?? (scanBarcodes ? "Scan streepjescode of maak foto" : "Zet één product in het kader")}
            </p>
            {scanBarcodes && !hint && <p className="scanner-subhint">Rechtop of liggend werkt allebei</p>}
          </div>
        )}
        {!problem && !busy && scanBarcodes && barcodeStatus && (
          <p className="camera-barcode" data-testid="camera-barcode">
            {BARCODE_TEXT[barcodeStatus]}
            {barcodeStatus !== "looking" && (
              <button type="button" className="text-button" data-testid="camera-manual" onClick={onManual}>
                Zelf invullen
              </button>
            )}
          </p>
        )}
      </div>

      {!problem && (
        <div className="shutter-row">
          <span className="shutter-spacer" aria-hidden="true" />
          <motion.button
            type="button"
            className="shutter"
            aria-label={localOnly ? "Maak foto" : "Maak foto en herken product"}
            data-testid="shutter"
            disabled={status !== "live" || busy}
            whileTap={reduced ? undefined : { scale: 0.9 }}
            onClick={() => void shoot()}
          >
            <span />
          </motion.button>
          <button type="button" className="gallery-button" aria-label="Kies uit galerij" data-testid="camera-gallery" disabled={busy} onClick={onGallery}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <circle cx="8.5" cy="10" r="1.6" fill="currentColor" />
              <path d="M4.5 16.5l4.2-4.2a1.5 1.5 0 0 1 2.1 0L14 15.5l1.7-1.7a1.5 1.5 0 0 1 2.1 0l1.7 1.7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      <p className="camera-note">{localOnly ? "De foto blijft alleen op dit apparaat." : "Een foto gaat naar OpenAI. Zet er geen mensen op."}</p>

      <Karrie mood={busy ? "happy" : "searching"} beat={attempt} className="scanner-karrie" />
    </motion.div>
  );
}

function CameraHelp({ denied, onRetry, onGallery }: { denied: boolean; onRetry: () => void; onGallery: () => void }) {
  return (
    <div className="scanner-help" data-testid="camera-help">
      {denied ? (
        <>
          <p>
            <strong>Karrie mag de camera nog niet gebruiken.</strong>
          </p>
          <ul>
            <li>iPhone: tik in Safari op aA › Website-instellingen › Camera › Sta toe.</li>
            <li>Android: tik in Chrome op het slotje naast het adres › Rechten › Camera.</li>
            <li>Geïnstalleerde app: geef Safari of Chrome toegang tot de camera in de instellingen van je telefoon.</li>
          </ul>
          <PressButton variant="secondary" size="s" onClick={onRetry}>
            Opnieuw proberen
          </PressButton>
        </>
      ) : (
        <p>
          <strong>Geen camera gevonden.</strong> Kies een foto uit je galerij.
        </p>
      )}
      <PressButton variant="primary" size="s" data-testid="camera-gallery" onClick={onGallery}>
        Kies uit galerij
      </PressButton>
    </div>
  );
}
