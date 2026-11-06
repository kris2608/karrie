import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useEffect, useRef, useState, type RefObject } from "react";
import { cleanEan, isValidEan, type EanFormat } from "../../domain/ean";

export type CameraProblem = "denied" | "unavailable";

const FORMATS: Partial<Record<BarcodeFormat, EanFormat>> = {
  [BarcodeFormat.EAN_13]: "ean-13",
  [BarcodeFormat.EAN_8]: "ean-8",
  [BarcodeFormat.UPC_A]: "upc-a",
  [BarcodeFormat.UPC_E]: "upc-e",
};

function hints() {
  const map = new Map<DecodeHintType, unknown>();
  map.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
  map.set(DecodeHintType.TRY_HARDER, true);
  return map;
}

export function cameraSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
}

function releaseVideo(video: HTMLVideoElement | null) {
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}

function problemOf(error: unknown): CameraProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable";
}

type CameraOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  onReady: () => void;
  onDetect: (ean: string, format: EanFormat) => void;
  onProblem: (problem: CameraProblem) => void;
};

/**
 * Decodes frames on the device only. Frames are never stored or sent anywhere;
 * the first valid barcode stops the camera straight away.
 */
export function useCamera({ videoRef, active, onReady, onDetect, onProblem }: CameraOptions) {
  const callbacks = useRef({ onReady, onDetect, onProblem });
  callbacks.current = { onReady, onDetect, onProblem };
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!active || !visible) return;
    const video = videoRef.current;
    if (!video) return;
    if (!cameraSupported()) {
      callbacks.current.onProblem("unavailable");
      return;
    }

    let cancelled = false;
    let done = false;
    let controls: IScannerControls | null = null;
    const reader = new BrowserMultiFormatReader(hints(), { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 600 });

    const stop = () => {
      controls?.stop();
      controls = null;
      releaseVideo(video);
    };

    reader
      .decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } },
        video,
        (result) => {
          if (!result || done || cancelled) return;
          const format = FORMATS[result.getBarcodeFormat()];
          const code = cleanEan(result.getText());
          if (!format || !isValidEan(code, format)) return;
          done = true;
          stop();
          callbacks.current.onDetect(code, format);
        },
      )
      .then((started) => {
        controls = started;
        if (cancelled || done) stop();
        else callbacks.current.onReady();
      })
      .catch((error: unknown) => {
        releaseVideo(video);
        if (!cancelled) callbacks.current.onProblem(problemOf(error));
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, visible, videoRef]);
}
