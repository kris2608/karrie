import { useEffect, useRef, type RefObject } from "react";
import { barcodeReader, createConfirmation, drawBand, READER_RULES } from "./barcodeReader";

type BarcodeOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** False while busy, in the background or once a product is identified. */
  active: boolean;
  /** A new session forgets which codes were already reported. */
  session: number;
  onDetect: (ean: string) => void;
};

/**
 * Reads barcodes from the live preview a few times a second. Frames are drawn to a canvas
 * on the device and never leave it; only a confirmed code is reported.
 */
export function useBarcode({ videoRef, active, session, onDetect }: BarcodeOptions) {
  const callback = useRef(onDetect);
  callback.current = onDetect;
  const confirmation = useRef(createConfirmation());

  useEffect(() => {
    confirmation.current = createConfirmation();
  }, [session]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && document.visibilityState === "visible") {
        const reader = await barcodeReader();
        if (cancelled || !reader) return;
        if (drawBand(video, video.videoWidth, video.videoHeight, canvas, READER_RULES.liveWidth)) {
          const ean = confirmation.current(await reader.live(canvas).catch(() => null));
          if (cancelled) return;
          if (ean) callback.current(ean);
        }
      }
      timer = setTimeout(() => void tick(), READER_RULES.intervalMs);
    };
    timer = setTimeout(() => void tick(), READER_RULES.intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      canvas.width = 0;
    };
  }, [active, videoRef]);
}
