import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import type { AdventureItem } from "../../domain/types";
import { vision, type VisionResult } from "../../services/vision/client";
import type { RecognizedProduct } from "../../services/vision/types";
import { useAdventure } from "../../state/AdventureContext";
import { blobToDataUrl, decodePhoto, processCrop, releasePhoto, type AspectId, type CropRect, type ProcessedPhoto } from "./imageProcessing";
import { PhotoCropper } from "./PhotoCropper";
import { PhotoResultSheet } from "./PhotoResultSheet";
import { savePhoto } from "../../storage/photos";

export type PhotoFlowHandle = { open: (target?: AdventureItem) => void };

type PhotoFlowProps = {
  ref?: Ref<PhotoFlowHandle>;
  items: AdventureItem[];
  onDone: (message: string) => void;
};

type Problem = { title: string; text: string; retry: boolean; recrop?: boolean };

type Step =
  | { kind: "idle" }
  | { kind: "decoding" }
  | { kind: "crop" }
  | { kind: "recognizing"; slow: boolean }
  | { kind: "problem"; problem: Problem }
  | { kind: "result"; product: RecognizedProduct | null };

const UNREADABLE: Problem = { title: "Deze foto lukt niet", text: "Karrie kan deze foto niet openen. Kies een andere foto of maak een nieuwe.", retry: false };

function problemFor(result: Exclude<VisionResult, { status: "ok" } | { status: "aborted" }>): Problem {
  if (result.status === "offline") {
    return { title: "Geen internet", text: "Foto herkennen lukt nu niet. Je kunt de foto wel gebruiken en zelf een naam typen.", retry: true };
  }
  if (result.status === "limit") {
    return result.code === "device-limit"
      ? { title: "Genoeg voor vandaag", text: "Je hebt vandaag al veel foto's laten herkennen. Morgen kan het weer. De foto zelf gebruiken kan altijd.", retry: false }
      : { title: "Even te druk", text: "Karrie herkent nu even te veel foto's. Probeer het straks nog eens, of vul het zelf in.", retry: true };
  }
  if (result.code === "refused" || result.code === "rejected") {
    return { title: "Niet herkend", text: "Karrie kan deze foto niet herkennen. Probeer een andere foto, of vul het zelf in.", retry: false };
  }
  return { title: "Herkennen lukt nu niet", text: "Karrie kan de foto nu niet herkennen. Probeer het nog eens, of vul het zelf in.", retry: true };
}

/** Parent photo: crop, then use it directly or let OpenAI suggest what it is. Nothing is uploaded without a tap on "Herken product". */
export function PhotoFlow({ ref, items, onDone }: PhotoFlowProps) {
  const { dispatch } = useAdventure();
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<AdventureItem | undefined>();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState<AspectId>("square");
  const [rect, setRect] = useState<CropRect | null>(null);
  const [processed, setProcessed] = useState<ProcessedPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const liveTarget = target && items.find((item) => item.id === target.id);

  useImperativeHandle(ref, () => ({
    open(next) {
      setTarget(next);
      vision.warmUp();
      inputRef.current?.click();
    },
  }));

  useEffect(() => {
    if (!processed) return;
    const url = URL.createObjectURL(processed.saved);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [processed]);

  useEffect(() => () => request.current?.abort(), []);

  const replaceImage = useCallback((next: HTMLImageElement | null) => {
    setImage((current) => {
      if (current && current !== next) releasePhoto(current);
      return next;
    });
  }, []);

  function close() {
    request.current?.abort();
    request.current = null;
    replaceImage(null);
    setProcessed(null);
    setRect(null);
    setStep({ kind: "idle" });
  }

  async function picked(file: File | undefined) {
    if (!file) return;
    setStep({ kind: "decoding" });
    setProcessed(null);
    try {
      const decoded = await decodePhoto(file);
      replaceImage(decoded);
      setAspect(decoded.naturalHeight > decoded.naturalWidth * 1.15 ? "portrait" : "square");
      setStep({ kind: "crop" });
    } catch {
      setStep({ kind: "problem", problem: UNREADABLE });
    }
  }

  async function crop(): Promise<ProcessedPhoto | null> {
    if (!image || !rect) return null;
    try {
      const next = await processCrop(image, rect);
      setProcessed(next);
      return next;
    } catch {
      setStep({ kind: "problem", problem: UNREADABLE });
      return null;
    }
  }

  async function recognize(photo: ProcessedPhoto | null) {
    if (!photo || vision.busy()) return;
    setStep({ kind: "recognizing", slow: false });
    const controller = new AbortController();
    request.current = controller;
    const result = await vision.recognize(await blobToDataUrl(photo.upload), {
      signal: controller.signal,
      onSlow: () => setStep((current) => (current.kind === "recognizing" ? { kind: "recognizing", slow: true } : current)),
    });
    if (request.current !== controller) return;
    request.current = null;
    if (result.status === "aborted") return;
    if (result.status === "ok") {
      if (result.product.containsPeople) {
        setStep({
          kind: "problem",
          problem: { title: "Alleen het product graag", text: "Er staat iemand op de foto. Snij hem zo bij dat alleen het product te zien is.", retry: false, recrop: true },
        });
        return;
      }
      setStep({ kind: "result", product: result.product });
      return;
    }
    setStep({ kind: "problem", problem: problemFor(result) });
  }

  async function usePhotoDirectly() {
    const photo = processed ?? (await crop());
    if (!photo) return;
    if (liveTarget) {
      const photoId = await savePhoto(photo.saved);
      dispatch({ type: "set-photo", itemId: liveTarget.id, photoId });
      close();
      onDone(`Jouw foto staat bij ${liveTarget.name}`);
      return;
    }
    setStep({ kind: "result", product: null });
  }

  function repick() {
    request.current?.abort();
    inputRef.current?.click();
  }

  const open = step.kind !== "idle";
  const busy = step.kind === "decoding" || step.kind === "recognizing";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="photo-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void picked(file);
        }}
      />
      <Sheet open={open} onClose={busy ? () => undefined : close} label="Foto herkennen">
        {step.kind === "decoding" && <p className="photo-wait">Foto openen…</p>}

        {step.kind === "crop" && image && (
          <>
            <h2>{liveTarget ? `Foto voor ${liveTarget.name}` : "Foto herkennen"}</h2>
            <PhotoCropper key={`${image.src}-${aspect}`} image={image} aspect={aspect} onAspect={setAspect} onCrop={setRect} />
            <p className="sheet-note photo-hint">Schuif en zoom tot alleen het product in beeld is, zonder mensen.</p>
            {liveTarget ? (
              <>
                <PressButton variant="primary" wide data-testid="photo-use" disabled={!rect} onClick={() => void usePhotoDirectly()}>
                  Gebruik foto
                </PressButton>
                <PressButton variant="secondary" wide data-testid="photo-recognize" disabled={!rect} onClick={async () => recognize(await crop())}>
                  Herken product
                </PressButton>
              </>
            ) : (
              <>
                <PressButton variant="primary" wide data-testid="photo-recognize" disabled={!rect} onClick={async () => recognize(await crop())}>
                  Herken product
                </PressButton>
                <PressButton variant="secondary" wide data-testid="photo-manual" disabled={!rect} onClick={() => void usePhotoDirectly()}>
                  Zelf invullen
                </PressButton>
              </>
            )}
            <div className="sheet-actions scan-actions">
              <PressButton variant="quiet" onClick={close}>
                Annuleren
              </PressButton>
              <PressButton variant="quiet" data-testid="photo-repick" onClick={repick}>
                Andere foto
              </PressButton>
            </div>
            <p className="scan-attribution">Bij "Herken product" gaat alleen deze uitsnede naar OpenAI. De foto blijft verder alleen op dit apparaat.</p>
          </>
        )}

        {step.kind === "recognizing" && (
          <div className="photo-wait" aria-live="polite" data-testid="photo-wait">
            {previewUrl && (
              <span className="product-art item-photo photo-wait-art">
                <img src={previewUrl} alt="" />
              </span>
            )}
            <strong>Karrie kijkt goed…</strong>
            {step.slow && <p className="sheet-note">Karrie wordt even wakker. De eerste foto kan een halve minuut duren.</p>}
            <PressButton variant="quiet" wide onClick={close}>
              Annuleren
            </PressButton>
          </div>
        )}

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
            {step.problem.recrop && image && (
              <PressButton variant="primary" wide onClick={() => setStep({ kind: "crop" })}>
                Bijsnijden
              </PressButton>
            )}
            {step.problem.retry && processed && (
              <PressButton variant="primary" wide data-testid="photo-retry" onClick={() => void recognize(processed)}>
                Probeer opnieuw
              </PressButton>
            )}
            {processed && !step.problem.recrop && (
              <PressButton variant="secondary" wide data-testid="photo-manual" onClick={() => void usePhotoDirectly()}>
                {liveTarget ? "Gebruik foto" : "Zelf invullen"}
              </PressButton>
            )}
            <div className="sheet-actions scan-actions">
              <PressButton variant="quiet" onClick={close}>
                Annuleren
              </PressButton>
              <PressButton variant="secondary" onClick={repick}>
                Opnieuw fotograferen
              </PressButton>
            </div>
          </>
        )}

        {step.kind === "result" && processed && previewUrl && (
          <PhotoResultSheet
            key={step.product ? "recognized" : "manual"}
            product={step.product}
            photoUrl={previewUrl}
            photo={processed.saved}
            target={liveTarget}
            items={items}
            onRetake={repick}
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
