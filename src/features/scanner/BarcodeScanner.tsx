import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { ItemArt } from "../../components/ItemArt";
import { Karrie, type Mood } from "../../components/mascot/Karrie";
import { PressButton } from "../../components/ui/PressButton";
import { StarIcon } from "../../components/ui/StarIcon";
import { canonicalEan, cleanEan, sameEan, type EanFormat } from "../../domain/ean";
import { matchesItemType } from "../../domain/productType";
import type { AdventureItem, ScannedProduct } from "../../domain/types";
import { buzz } from "../../feedback/haptics";
import { playStar } from "../../feedback/sound";
import { lookupProduct, type LookupResult } from "../../services/off/lookup";
import { spring } from "../../motion/variants";
import { cameraWanted, initialScan, scannerReducer } from "./scannerMachine";
import { useCamera } from "./useCamera";

export type ScanMode = "add-product" | "replace-product" | "verify-adventure-item";

export type LookupOutcome = Extract<LookupResult, { status: "found" | "not-found" | "offline" | "error" }>;

export type ScanOutcome =
  | { kind: "lookup"; result: LookupOutcome }
  | { kind: "verified"; product?: ScannedProduct }
  | { kind: "confirmed"; product: ScannedProduct };

type BarcodeScannerProps = {
  mode: ScanMode;
  target?: AdventureItem;
  onResult: (outcome: ScanOutcome) => void;
  onClose: () => void;
};

const TITLES: Record<ScanMode, string> = {
  "add-product": "Scan een product",
  "replace-product": "Scan de verpakking",
  "verify-adventure-item": "Scan de barcode",
};

const RETRY_AFTER_MISS = 1200;

export function BarcodeScanner({ mode, target, onResult, onClose }: BarcodeScannerProps) {
  const reduced = useReducedMotion() ?? false;
  const present = useIsPresent();
  const [state, send] = useReducer(scannerReducer, initialScan);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanIdRef = useRef(state.scanId);
  const formatRef = useRef<EanFormat | undefined>(undefined);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  scanIdRef.current = state.scanId;

  useEffect(() => {
    send({ type: "open" });
    return () => send({ type: "close" });
  }, []);

  useCamera({
    videoRef,
    active: present && cameraWanted(state.status),
    onReady: () => send({ type: "camera-ready" }),
    onDetect: (ean, format) => {
      formatRef.current = format;
      buzz(15);
      send({ type: "detect", ean });
    },
    onProblem: (problem) => {
      send({ type: problem === "denied" ? "camera-denied" : "camera-unavailable" });
      if (problem === "unavailable") setManual(true);
    },
  });

  useEffect(() => {
    if (state.status !== "barcode-detected" || !state.ean) return;
    const scanId = state.scanId;
    const ean = state.ean;
    const stale = () => scanIdRef.current !== scanId;

    if (mode === "verify-adventure-item" && target?.ean) {
      send(sameEan(ean, target.ean) ? { type: "verified", scanId } : { type: "mismatch", scanId });
      return;
    }

    const controller = new AbortController();
    send({ type: "load", scanId });
    void lookupProduct(ean, { signal: controller.signal, format: formatRef.current }).then((result) => {
      if (stale() || result.status === "aborted") return;
      if (result.status === "invalid") {
        send({ type: "mismatch", scanId });
        return;
      }
      if (mode !== "verify-adventure-item") {
        resultRef.current({ kind: "lookup", result });
        return;
      }
      if (result.status === "found") {
        const fits = target ? matchesItemType(result.product, target.productId) : false;
        send(fits ? { type: "found", scanId, product: result.product } : { type: "mismatch", scanId });
      } else if (result.status === "not-found") {
        send({ type: "not-found", scanId });
      } else {
        send({ type: "network-error", scanId });
      }
    });
    return () => controller.abort();
    // Only a new scanId (next scan or close) may cancel a running lookup.
  }, [state.scanId]);

  useEffect(() => {
    if (state.status === "verification-success") {
      playStar();
      buzz([20, 40, 30]);
      const product = state.product;
      const timer = window.setTimeout(
        () => resultRef.current(confirmed && product ? { kind: "confirmed", product } : { kind: "verified", product }),
        reduced ? 350 : 650,
      );
      return () => window.clearTimeout(timer);
    }
    if (state.status === "verification-failed") {
      const timer = window.setTimeout(() => send({ type: "retry" }), RETRY_AFTER_MISS);
      return () => window.clearTimeout(timer);
    }
  }, [state.status, state.product, confirmed, reduced]);

  function close() {
    send({ type: "close" });
    onClose();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      send({ type: "close" });
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submitTyped(event: FormEvent) {
    event.preventDefault();
    const code = cleanEan(typed);
    if (!canonicalEan(code)) {
      setTypedError(true);
      return;
    }
    formatRef.current = undefined;
    setTypedError(false);
    send({ type: "detect", ean: code });
  }

  function confirmMatch() {
    if (!state.product) return;
    setConfirmed(true);
    send({ type: "verified", scanId: state.scanId, product: state.product });
  }

  const status = state.status;
  const busy = status === "barcode-detected" || status === "loading-product";
  const success = status === "verification-success";
  const failed = status === "verification-failed";
  const canType = status === "opening-camera" || status === "scanning" || status === "camera-unavailable" || status === "permission-denied";
  const mood: Mood = success ? "celebrating" : failed ? "surprised" : busy ? "happy" : "searching";
  const askParent = mode === "verify-adventure-item" && status === "product-found" && state.product;
  const cannotCheck = status === "product-not-found" || status === "network-error";
  const showCamera = status !== "permission-denied" && status !== "camera-unavailable";

  return (
    <motion.div
      className="scanner"
      role="dialog"
      aria-modal="true"
      aria-label={TITLES[mode]}
      data-testid="scanner"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <header className="scanner-bar">
        <h2>{TITLES[mode]}</h2>
        <button type="button" className="round-button round-s scanner-close" aria-label="Sluit scanner" data-testid="scanner-close" onClick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {target && mode === "verify-adventure-item" && (
        <div className="scanner-target">
          <ItemArt item={target} />
          <span>{target.name}</span>
        </div>
      )}

      <motion.div
        className={`scanner-frame${success ? " is-success" : ""}${failed ? " is-miss" : ""}`}
        animate={failed && !reduced ? { x: [0, -6, 6, -6, 6, -6, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
      >
        {showCamera ? (
          <video ref={videoRef} className="scanner-video" playsInline muted autoPlay aria-hidden="true" />
        ) : (
          <CameraHelp denied={status === "permission-denied"} onRetry={() => send({ type: "retry" })} />
        )}
        {showCamera && <span className="scanner-corners" aria-hidden="true" />}
        {status === "scanning" && !reduced && <span className="scanner-line" aria-hidden="true" />}
        {busy && (
          <span className="scanner-busy" role="status">
            <span className="scanner-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Karrie kijkt even…
          </span>
        )}
        <AnimatePresence>
          {success && (
            <motion.span
              className="scanner-star"
              aria-hidden="true"
              initial={{ scale: 0.2, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ opacity: 0 }}
              transition={spring}
            >
              <StarIcon />
              <b>+2</b>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="scanner-message" aria-live="polite">
        {success && <p className="scanner-say is-good">Jaaa! Dat is precies de goede!</p>}
        {failed && <p className="scanner-say">Oeps! Dat is een andere. Probeer nog eens!</p>}
        {cannotCheck && <p className="scanner-say">Karrie kan deze nu niet checken. Tik op Gevonden!</p>}
        {(status === "opening-camera" || status === "scanning") && <p className="scanner-hint">Houd de barcode in beeld</p>}
      </div>

      {askParent && state.product && (
        <div className="scanner-confirm" data-testid="scan-confirm">
          <ItemArt
            item={{ icon: target?.icon ?? "pakket", name: state.product.name ?? "", imageUrl: state.product.imageUrl, imageKind: "photo" }}
            className="scanner-confirm-art"
          />
          <p>
            Is dit de <strong>{target?.name.toLowerCase()}</strong> die jullie zoeken?
          </p>
          <small>{[state.product.brand, state.product.name, state.product.packageSize].filter(Boolean).join(" · ")}</small>
          <div className="scanner-actions">
            <PressButton variant="quiet" onClick={() => send({ type: "retry" })}>
              Nee
            </PressButton>
            <PressButton variant="go" data-testid="scan-confirm-yes" onClick={confirmMatch}>
              Ja, dat is hem
            </PressButton>
          </div>
        </div>
      )}

      {cannotCheck && (
        <div className="scanner-actions">
          <PressButton variant="quiet" onClick={() => send({ type: "retry" })}>
            Opnieuw scannen
          </PressButton>
          <PressButton variant="secondary" onClick={close}>
            Oké
          </PressButton>
        </div>
      )}

      {canType && (
        <div className="scanner-manual">
          {manual ? (
            <form className="scanner-form" onSubmit={submitTyped} noValidate>
              <label htmlFor="scanner-digits">Cijfers onder de barcode</label>
              <div className="scanner-form-row">
                <input
                  id="scanner-digits"
                  data-testid="scanner-digits"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9 ]*"
                  maxLength={16}
                  value={typed}
                  aria-invalid={typedError}
                  onChange={(event) => {
                    setTyped(event.target.value);
                    setTypedError(false);
                  }}
                />
                <PressButton variant="primary" type="submit" data-testid="scanner-submit">
                  Zoek
                </PressButton>
              </div>
              {typedError && <p className="scanner-error">Deze cijfers kloppen niet. Kijk nog eens goed.</p>}
            </form>
          ) : (
            <button type="button" className="text-button scanner-type" data-testid="scanner-type" onClick={() => setManual(true)}>
              Typ de cijfers
            </button>
          )}
        </div>
      )}

      <Karrie mood={mood} beat={state.scanId} className="scanner-karrie" />
    </motion.div>
  );
}

function CameraHelp({ denied, onRetry }: { denied: boolean; onRetry: () => void }) {
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
          <strong>Geen camera gevonden.</strong> Typ de cijfers onder de barcode.
        </p>
      )}
    </div>
  );
}
