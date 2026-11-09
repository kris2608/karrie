import { useEffect, useRef, type RefObject } from "react";
import type { BandGeometry, BarcodePoint } from "./barcodeGeometry";
import { barcodeReader, createConfirmation, drawBand, READER_RULES } from "./barcodeReader";

/** A live decode with geometry, before the two-hit confirmation fires. */
export type BarcodeSighting = {
  points: BarcodePoint[];
  band: BandGeometry;
};

type BarcodeOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** False while busy, in the background or once a product is identified. */
  active: boolean;
  /** A new session forgets which codes were already reported. */
  session: number;
  onDetect: (ean: string) => void;
  /** Fires on every successful live decode (even before confirmation); null when nothing was seen. */
  onSighting?: (sighting: BarcodeSighting | null) => void;
};

/**
 * Reads barcodes from the live preview a few times a second. Frames are drawn to a canvas
 * on the device and never leave it; only a confirmed code is reported.
 */
export function useBarcode({ videoRef, active, session, onDetect, onSighting }: BarcodeOptions) {
  const callback = useRef(onDetect);
  callback.current = onDetect;
  const sight = useRef(onSighting);
  sight.current = onSighting;
  const confirmation = useRef(createConfirmation());

  useEffect(() => {
    confirmation.current = createConfirmation();
  }, [session]);

  useEffect(() => {
    if (!active) {
      sight.current?.(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && document.visibilityState === "visible") {
        const reader = await barcodeReader();
        if (cancelled || !reader) return;
        const band = drawBand(video, video.videoWidth, video.videoHeight, canvas, READER_RULES.liveWidth);
        if (band) {
          const hit = await reader.live(canvas).catch(() => null);
          if (cancelled) return;
          if (hit?.points && hit.points.length >= 2) sight.current?.({ points: hit.points, band });
          else sight.current?.(null);
          const ean = confirmation.current(hit);
          if (cancelled) return;
          if (ean) callback.current(ean);
        } else {
          sight.current?.(null);
        }
      }
      timer = setTimeout(() => void tick(), READER_RULES.intervalMs);
    };
    timer = setTimeout(() => void tick(), READER_RULES.intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      canvas.width = 0;
      sight.current?.(null);
    };
  }, [active, videoRef]);
}
