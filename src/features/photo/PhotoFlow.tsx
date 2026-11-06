import { AnimatePresence } from "motion/react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import type { AdventureItem } from "../../domain/types";
import { vision, type VisionResult } from "../../services/vision/client";
import type { RecognizedProduct } from "../../services/vision/types";
import { useAdventure } from "../../state/AdventureContext";
import { savePhoto } from "../../storage/photos";
import { blobToDataUrl, decodePhoto, fullRect, processPhoto, releasePhoto, type ProcessedPhoto } from "./imageProcessing";
import { PhotoCamera } from "./PhotoCamera";
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
  | { kind: "result"; product: RecognizedProduct | null };

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

/**
 * Camera first: the shutter tap is the parent's explicit action that sends the
 * framed photo to OpenAI. From the product sheet the shutter only stores the photo.
 */
export function PhotoFlow({ ref, items, onDone }: PhotoFlowProps) {
  const { dispatch } = useAdventure();
  const galleryRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<AdventureItem | undefined>();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const liveTarget = target && items.find((item) => item.id === target.id);

  useImperativeHandle(ref, () => ({
    open(next) {
      setTarget(next);
      setPhoto(null);
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
    setPhoto(null);
    setStep({ kind: "idle" });
  }

  async function captured(next: ProcessedPhoto) {
    setPhoto(next);
    if (liveTarget) {
      const photoId = await savePhoto(next.saved);
      dispatch({ type: "set-photo", itemId: liveTarget.id, photoId });
      close();
      onDone(`Jouw foto staat bij ${liveTarget.name}`);
      return;
    }
    await recognize(next);
  }

  async function fromGallery(file: File | undefined) {
    if (!file) return;
    try {
      const image = await decodePhoto(file);
      try {
        await captured(await processPhoto(image, fullRect({ width: image.naturalWidth, height: image.naturalHeight })));
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
    const result = await vision.recognize(await blobToDataUrl(next.upload), {
      signal: controller.signal,
      onSlow: () => setStep((current) => (current.kind === "recognizing" ? { kind: "recognizing", slow: true } : current)),
    });
    if (request.current !== controller) return;
    request.current = null;
    if (result.status === "aborted") return;
    if (result.status === "ok") {
      setStep(result.product.containsPeople ? { kind: "problem", problem: PEOPLE } : { kind: "result", product: result.product });
      return;
    }
    setStep({ kind: "problem", problem: problemFor(result) });
  }

  function retake() {
    request.current?.abort();
    request.current = null;
    setPhoto(null);
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
            onCapture={(next) => void captured(next)}
            onGallery={() => galleryRef.current?.click()}
            onClose={close}
          />
        )}
      </AnimatePresence>
      <Sheet open={sheetOpen} onClose={close} label="Foto herkennen">
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
              <PressButton variant="secondary" wide data-testid="photo-manual" onClick={() => setStep({ kind: "result", product: null })}>
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

        {step.kind === "result" && photo && previewUrl && (
          <PhotoResultSheet
            key={step.product ? "recognized" : "manual"}
            product={step.product}
            photoUrl={previewUrl}
            photo={photo.saved}
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
