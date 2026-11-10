import { useCallback, useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 72;
const PULL_MAX = 120;

type Options = {
  /** When false, touch tracking is idle (e.g. a sheet is open). */
  enabled?: boolean;
  onRefresh: () => void | Promise<void>;
};

/**
 * Custom pull-to-refresh for document scroll. Needed because `body` sets
 * `overscroll-behavior-y: none`, so browser PTR never fires.
 */
export function usePullToRefresh({ enabled = true, onRefresh }: Options) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    pullRef.current = PULL_THRESHOLD;
    setPull(PULL_THRESHOLD);
    try {
      await onRefreshRef.current();
    } finally {
      busy.current = false;
      pullRef.current = 0;
      setRefreshing(false);
      setPull(0);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (event: TouchEvent) => {
      if (busy.current || !atTop() || event.touches.length !== 1) {
        startY.current = null;
        return;
      }
      startY.current = event.touches[0].clientY;
    };

    const onMove = (event: TouchEvent) => {
      if (startY.current == null || busy.current) return;
      const delta = event.touches[0].clientY - startY.current;
      if (delta <= 0 || !atTop()) {
        if (pullRef.current) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      const distance = Math.min(PULL_MAX, delta * 0.55);
      pullRef.current = distance;
      setPull(distance);
      if (delta > 8) event.preventDefault();
    };

    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      if (busy.current) return;
      if (pullRef.current >= PULL_THRESHOLD) {
        void run();
        return;
      }
      pullRef.current = 0;
      setPull(0);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, run]);

  return {
    pull,
    refreshing,
    /** 0–1 progress toward the refresh threshold (capped while refreshing). */
    progress: refreshing ? 1 : Math.min(1, pull / PULL_THRESHOLD),
  };
}
