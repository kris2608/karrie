import { AnimatePresence } from "motion/react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { mergeDraft, type ProductDraft } from "../../domain/productDraft";
import type { AdventureItem } from "../../domain/types";
import { trackEvent } from "../../services/analytics";
import { lookupBarcode, type BarcodeOutcome } from "../../services/barcode/lookup";
import { vision, type VisionResult } from "../../services/vision/client";
import { useAdventure } from "../../state/AdventureContext";
import { barcodeSource } from "../../state/analyticsEvents";
import { savePhoto } from "../../storage/photos";
import { decodeStill } from "./barcodeReader";
import { blobToDataUrl, decodePhoto, fullRect, processPhoto, releasePhoto, type ProcessedPhoto } from "./imageProcessing";
import { PhotoCamera, type BarcodeStatus } from "./PhotoCamera";
import { PhotoResultSheet } from "./PhotoResultSheet";

export type PhotoFlowHandle = { open: (target?: AdventureItem) => void };

type PhotoFlowProps = {
  ref?: Ref<PhotoFlowHandle>;
  items: AdventureItem[];
  onDone: (message: string) => void;
};

type Problem = { title: string; text: string; retry: boolean; manual: boolean };

type Step =
  | { kind: "idle" }
  | { kind: "camera" }
  | { kind: "recognizing"; slow: boolean }
  | { kind: "problem"; problem: Problem }
  | { kind: "result"; draft: ProductDraft | null };

/** The last barcode the phone read in this camera session, and its lookup. */
type Scan = { ean: string; outcome: Promise<BarcodeOutcome> };

const UNREADABLE: Problem = { title: "Deze foto lukt niet", text: "Karrie kan deze foto niet openen. Maak een nieuwe foto.", retry: false, manual: false };
const PEOPLE: Problem = { title: "Alleen het product graag", text: "Er staat iemand op de foto. Maak een nieuwe foto met alleen het product.", retry: false, manual: false };

function problemFor(result: Exclude<VisionResult, { status: "ok" } | { status: "aborted" }>): Problem {
  if (result.status === "offline") {
    return { title: "Geen internet", text: "Foto herkennen lukt nu niet. Je kunt de foto wel gebruiken en zelf een naam typen.", retry: true, manual: true };
  }
  if (result.status === "limit") {
    return result.code === "device-limit"
      ? { title: "Genoeg voor vandaag", text: "Je hebt vandaag al veel foto's laten herkennen. Morgen kan het weer. Zelf invullen kan altijd.", retry: false, manual: true }
      : { title: "Even te druk", text: "Karrie herkent nu even te veel foto's. Probeer het straks nog eens, of vul het zelf in.", retry: true, manual: true };
  }
  if (result.code === "refused" || result.code === "rejected") {
    return { title: "Niet herkend", text: "Karrie kan deze foto niet herkennen. Maak een nieuwe foto, of vul het zelf in.", retry: false, manual: true };
  }
  return { title: "Herkennen lukt nu niet", text: "Karrie kan de foto nu niet herkennen. Probeer het nog eens, of vul het zelf in.", retry: true, manual: true };
}

/** What a barcode lookup adds to a draft: a parent's earlier product, or a record that names the product. */
function known(ean: string, outcome: BarcodeOutcome | undefined) {
  if (outcome?.status === "mine") return { ean, mine: outcome.item };
  if (outcome?.status === "found") return { ean, barcode: outcome.answer };
  return { ean };
}

const identified = (outcome: BarcodeOutcome) => outcome.status === "mine" || outcome.status === "found";

/**
 * One camera: barcodes are read on the device while the preview runs, and the shutter tap is the
 * parent's explicit action that sends the framed photo to OpenAI. From the product sheet the
 * shutter only stores the photo and no barcodes are read.
 */
export function PhotoFlow({ ref, items, onDone }: PhotoFlowProps) {
  const { dispatch, mine } = useAdventure();
  const galleryRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<AdventureItem | undefined>();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [barcodeStatus, setBarcodeStatus] = useState<BarcodeStatus>(null);
  const scan = useRef<Scan | null>(null);
  const request = useRef<AbortController | null>(null);
  /** Counts camera openings, so one code read again and again in the same session is counted once. */
  const session = useRef(0);
  const stepKind = useRef<Step["kind"]>("idle");
  const liveTarget = target && items.find((item) => item.id === target.id);

  useEffect(() => {
    stepKind.current = step.kind;
  }, [step.kind]);

  useImperativeHandle(ref, () => ({
    open(next) {
      session.current += 1;
      setTarget(next);
      setPhoto(null);
      scan.current = null;
      setBarcodeStatus(null);
      if (!next) vision.warmUp();
      setStep({ kind: "camera" });
    },
  }));

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo.saved);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => () => request.current?.abort(), []);

  function close() {
    request.current?.abort();
    request.current = null;
    scan.current = null;
    setBarcodeStatus(null);
    setPhoto(null);
    setStep({ kind: "idle" });
  }

  function startLookup(ean: string): Scan {
    if (scan.current?.ean === ean) return scan.current;
    const next = { ean, outcome: lookupBarcode(ean, mine) };
    scan.current = next;
    return next;
  }

  /** Anonymous count of a successful identification; the code itself only keys the once-per-session check. */
  function countBarcode(ean: string, outcome: BarcodeOutcome) {
    const source = barcodeSource(outcome);
    if (source) trackEvent({ name: "product_recognized", data: { method: "barcode", source } }, `${session.current}:${ean}`);
  }

  /** A confirmed code from the live preview: show the product straight away when it is known, else keep the camera open. */
  function barcode(ean: string) {
    const current = startLookup(ean);
    setBarcodeStatus("looking");
    void current.outcome.then((outcome) => {
      if (scan.current !== current) return;
      if (identified(outcome)) {
        if (stepKind.current === "camera") countBarcode(ean, outcome);
        setStep((now) => (now.kind === "camera" ? { kind: "result", draft: mergeDraft(known(ean, outcome)) } : now));
        return;
      }
      setBarcodeStatus(outcome.status === "none" ? "unknown" : "failed");
    });
  }

  async function captured(next: ProcessedPhoto, fromGallery?: HTMLImageElement) {
    setPhoto(next);
    if (liveTarget) {
      const photoId = await savePhoto(next.saved);
      dispatch({ type: "set-photo", itemId: liveTarget.id, photoId });
      close();
      onDone(`Jouw foto staat bij ${liveTarget.name}`);
      return;
    }
    if (fromGallery) {
      // A barcode in the picture can identify the product without asking OpenAI.
      const ean = await decodeStill(fromGallery).catch(() => null);
      if (ean) {
        const outcome = await startLookup(ean).outcome;
        if (identified(outcome)) {
          countBarcode(ean, outcome);
          const draft = mergeDraft(known(ean, outcome));
          // A gallery picture with a barcode is often the back of the pack; a known front photo looks better.
          if (draft.imageUrl || draft.photoId) setPhoto(null);
          setStep({ kind: "result", draft });
          return;
        }
      }
    }
    await recognize(next);
  }

  async function fromGallery(file: File | undefined) {
    if (!file) return;
    try {
      const image = await decodePhoto(file);
      try {
        await captured(await processPhoto(image, fullRect({ width: image.naturalWidth, height: image.naturalHeight })), image);
      } finally {
        releasePhoto(image);
      }
    } catch {
      setStep({ kind: "problem", problem: UNREADABLE });
    }
  }

  async function recognize(next: ProcessedPhoto) {
    if (vision.busy()) return;
    setStep({ kind: "recognizing", slow: false });
    const controller = new AbortController();
    request.current = controller;
    const scanned = scan.current;
    const result = await vision.recognize(await blobToDataUrl(next.upload), {
      signal: controller.signal,
      scannedEan: scanned?.ean,
      onSlow: () => setStep((current) => (current.kind === "recognizing" ? { kind: "recognizing", slow: true } : current)),
    });
    if (request.current !== controller) return;
    request.current = null;
    if (result.status === "aborted") return;
    if (result.status === "ok") {
      if (result.product.containsPeople) return setStep({ kind: "problem", problem: PEOPLE });
      if (result.product.recognized) trackEvent({ name: "product_recognized", data: { method: "photo", source: "openai" } });
      const lookup = scanned ? known(scanned.ean, await scanned.outcome) : {};
      setStep({ kind: "result", draft: mergeDraft({ ...lookup, photo: result.product }) });
      return;
    }
    setStep({ kind: "problem", problem: problemFor(result) });
  }

  /** Zelf invullen keeps a scanned code, so the product is found by it next time. */
  function manual() {
    setStep({ kind: "result", draft: scan.current ? mergeDraft({ ean: scan.current.ean }) : null });
  }

  function retake() {
    request.current?.abort();
    request.current = null;
    setPhoto(null);
    setBarcodeStatus(null);
    setStep({ kind: "camera" });
  }

  const cameraOpen = step.kind === "camera" || step.kind === "recognizing";
  const sheetOpen = step.kind === "problem" || step.kind === "result";

  return (
    <>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="photo-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void fromGallery(file);
        }}
      />
      <AnimatePresence>
        {cameraOpen && (
          <PhotoCamera
            key="camera"
            title={liveTarget ? `Foto voor ${liveTarget.name}` : "Maak een foto"}
            localOnly={Boolean(liveTarget)}
            busy={step.kind === "recognizing"}
            slow={step.kind === "recognizing" && step.slow}
            preview={previewUrl}
            scanBarcodes={!liveTarget}
            barcodeStatus={barcodeStatus}
            onBarcode={barcode}
            onManual={manual}
            onCapture={(next) => void captured(next)}
            onGallery={() => galleryRef.current?.click()}
            onClose={close}
          />
        )}
      </AnimatePresence>
      <Sheet open={sheetOpen} onClose={close} label="Product herkennen">
        {step.kind === "problem" && (
          <>
            <h2>{step.problem.title}</h2>
            {previewUrl && (
              <span className="product-art item-photo photo-problem-art">
                <img src={previewUrl} alt="" />
              </span>
            )}
            <p className="sheet-note" data-testid="photo-problem">
              {step.problem.text}
            </p>
            {step.problem.retry && photo && (
              <PressButton variant="primary" wide data-testid="photo-retry" onClick={() => void recognize(photo)}>
                Probeer opnieuw
              </PressButton>
            )}
            {step.problem.manual && photo && (
              <PressButton variant="secondary" wide data-testid="photo-manual" onClick={manual}>
                Zelf invullen
              </PressButton>
            )}
            <div className="sheet-actions scan-actions">
              <PressButton variant="quiet" onClick={close}>
                Annuleren
              </PressButton>
              <PressButton variant="secondary" data-testid="photo-retake" onClick={retake}>
                Opnieuw fotograferen
              </PressButton>
            </div>
          </>
        )}

        {step.kind === "result" && (
          <PhotoResultSheet
            key={step.draft ? `${step.draft.ean ?? ""}|${step.draft.name}` : "manual"}
            draft={step.draft}
            photoUrl={photo && previewUrl ? previewUrl : undefined}
            photo={photo?.saved}
            items={items}
            onRetake={retake}
            onCancel={close}
            onDone={(message) => {
              close();
              onDone(message);
            }}
          />
        )}
      </Sheet>
    </>
  );
}
