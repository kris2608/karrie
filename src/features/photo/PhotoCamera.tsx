import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Karrie } from "../../components/mascot/Karrie";
import { PressButton } from "../../components/ui/PressButton";
import { buzz } from "../../feedback/haptics";
import { capturePhoto, type ProcessedPhoto } from "./imageProcessing";
import { useCamera, type CameraProblem } from "./useCamera";

type PhotoCameraProps = {
  title: string;
  /** True when the shutter only stores the photo on this device. */
  localOnly: boolean;
  busy: boolean;
  slow: boolean;
  preview: string | null;
  onCapture: (photo: ProcessedPhoto) => void;
  onGallery: () => void;
  onClose: () => void;
};

type CameraStatus = "opening" | "live" | "capturing" | CameraProblem;

function finePointer() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
}

export function PhotoCamera({ title, localOnly, busy, slow, preview, onCapture, onGallery, onClose }: PhotoCameraProps) {
  const reduced = useReducedMotion() ?? false;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("opening");
  const [attempt, setAttempt] = useState(0);
  const problem = status === "denied" || status === "unavailable";

  const track = useCamera({
    videoRef,
    active: !busy && !problem,
    session: attempt,
    onReady: () => setStatus((current) => (current === "capturing" ? current : "live")),
    onProblem: setStatus,
  });

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
      onCapture(await capturePhoto(video, track.current));
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
        <h2>{title}</h2>
        <button type="button" className="round-button round-s scanner-close" aria-label="Sluit camera" data-testid="camera-close" disabled={busy} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="scanner-frame camera-frame">
        {problem ? (
          <CameraHelp denied={status === "denied"} onRetry={retry} onGallery={onGallery} />
        ) : (
          <>
            <video ref={videoRef} className="scanner-video" playsInline muted autoPlay aria-hidden="true" />
            {preview && busy && <img className="camera-still" src={preview} alt="" />}
            <span className="scanner-corners" aria-hidden="true" />
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
        {!problem && !busy && <p className="scanner-hint">Zet één product in het kader</p>}
      </div>

      {!problem && (
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
      )}

      <p className="camera-note">
        {localOnly ? "De foto blijft alleen op dit apparaat." : "De foto gaat naar OpenAI om het product te herkennen. Zet er geen mensen op."}
      </p>
      {!problem && finePointer() && (
        <button type="button" className="text-button scanner-type" data-testid="camera-gallery" disabled={busy} onClick={onGallery}>
          Kies uit galerij
        </button>
      )}

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
