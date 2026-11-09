import { useLayoutEffect, useState, type RefObject } from "react";
import { mapDecodeToOverlay, polygonPath } from "./barcodeGeometry";
import type { BarcodeSighting } from "./useBarcode";

type BarcodeHighlightProps = {
  frameRef: RefObject<HTMLElement | null>;
  sighting: BarcodeSighting | null;
  /** When a code is confirmed and looked up, keep the last outline briefly in a calmer style. */
  confirmed?: boolean;
};

/**
 * Turquoise outline around the barcode the decoder actually saw, mapped from the decode band
 * onto the object-fit: cover preview. Pointer-events none so the shutter stays tappable.
 */
export function BarcodeHighlight({ frameRef, sighting, confirmed = false }: BarcodeHighlightProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const rect = frame.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(frame);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [frameRef]);

  if (!sighting || !size.width || !size.height) return null;
  const points = mapDecodeToOverlay(sighting.points, sighting.band, size.width, size.height);
  if (!points) return null;
  const d = polygonPath(points);
  if (!d) return null;

  return (
    <svg className={confirmed ? "barcode-highlight is-confirmed" : "barcode-highlight"} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true" data-testid="barcode-highlight">
      <path d={d} />
    </svg>
  );
}
