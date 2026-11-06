import { useEffect, useRef, useState, type RefObject } from "react";

export type CameraProblem = "denied" | "unavailable";

export function cameraSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
}

function problemOf(error: unknown): CameraProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable";
}

type CameraOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  /** Changing it restarts the stream, e.g. after "Opnieuw proberen". */
  session: number;
  onReady: () => void;
  onProblem: (problem: CameraProblem) => void;
};

/**
 * Live rear camera for the photo screen. Frames stay on the device until the
 * parent taps the shutter; the stream stops when the screen closes or the app
 * goes to the background.
 */
export function useCamera({ videoRef, active, session, onReady, onProblem }: CameraOptions) {
  const callbacks = useRef({ onReady, onProblem });
  callbacks.current = { onReady, onProblem };
  const track = useRef<MediaStreamTrack | null>(null);
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
    let stream: MediaStream | null = null;
    const stop = () => {
      stream?.getTracks().forEach((entry) => entry.stop());
      stream = null;
      track.current = null;
      video.pause();
      video.srcObject = null;
    };

    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(async (started) => {
        if (cancelled) {
          started.getTracks().forEach((entry) => entry.stop());
          return;
        }
        stream = started;
        track.current = started.getVideoTracks()[0] ?? null;
        video.srcObject = started;
        await video.play().catch(() => undefined);
        if (!cancelled) callbacks.current.onReady();
      })
      .catch((error: unknown) => {
        if (!cancelled) callbacks.current.onProblem(problemOf(error));
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, visible, session, videoRef]);

  return track;
}
