import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Mood } from "../components/mascot/Karrrie";
import type { AdventureItem } from "../domain/types";
import { buzz } from "../feedback/haptics";
import { playPop, playStar } from "../feedback/sound";

type Box = { x: number; y: number; width: number; height: number };

export type Flight = {
  token: number;
  item: AdventureItem;
  from: Box;
  basket: Box;
  star: Box;
};

export type ExitKind = "found" | "skip" | "fade";

type Options = {
  reduced: boolean;
  artRef: RefObject<HTMLElement | null>;
  basketRef: RefObject<SVGRectElement | null>;
  starRef: RefObject<HTMLElement | null>;
  onFound: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onFinished: () => void;
};

const NORMAL = { happyAt: 380, starAt: 600, unlockAt: 720, calmAt: 1000, finishAt: 1250, enterDelay: 0.42 };
const REDUCED = { happyAt: 0, starAt: 0, unlockAt: 220, calmAt: 500, finishAt: 450, enterDelay: 0 };

function box(element: Element | null | undefined): Box | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function useFoundSequence(options: Options) {
  const { reduced } = options;
  const latest = useRef(options);
  latest.current = options;

  const lock = useRef(false);
  const timers = useRef<number[]>([]);
  const calmTimer = useRef<number | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const [mood, setMood] = useState<Mood>("searching");
  const [beat, setBeat] = useState(0);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [exitKind, setExitKind] = useState<ExitKind>("fade");
  const [enterDelay, setEnterDelay] = useState(0);
  const [starPending, setStarPending] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(calmTimer.current);
    },
    [],
  );

  const later = useCallback((ms: number, run: () => void) => {
    if (ms <= 0) {
      run();
      return;
    }
    timers.current.push(window.setTimeout(run, ms));
  }, []);

  const react = useCallback((next: Mood, calmAfter: number) => {
    setMood(next);
    setBeat((value) => value + 1);
    window.clearTimeout(calmTimer.current);
    calmTimer.current = window.setTimeout(() => setMood("searching"), calmAfter);
  }, []);

  const release = useCallback(() => {
    lock.current = false;
    setLocked(false);
  }, []);

  const collect = useCallback(
    (item: AdventureItem, isLast: boolean) => {
      if (lock.current) return;
      lock.current = true;
      setLocked(true);
      const timing = reduced ? REDUCED : NORMAL;
      const { artRef, basketRef, starRef, onFound, onFinished } = latest.current;

      const from = box(artRef.current);
      const basket = box(basketRef.current);
      const star = box(starRef.current);
      const token = Date.now();
      const flies = !reduced && from && basket && star;

      setExitKind(flies ? "found" : "fade");
      setEnterDelay(timing.enterDelay);
      if (flies) setFlight({ token, item, from, basket, star });
      setStarPending(true);
      if (isLast) setFinishing(true);

      onFound();
      playPop();
      buzz(15);

      later(timing.happyAt, () => (isLast ? react("celebrating", 4000) : react("happy", timing.calmAt)));
      later(timing.starAt, () => {
        setStarPending(false);
        playStar();
      });
      later(timing.unlockAt, () => {
        setFlight((current) => (current?.token === token ? null : current));
        if (!isLast) release();
      });
      if (isLast) later(timing.finishAt, onFinished);
    },
    [later, react, reduced, release],
  );

  const skip = useCallback(() => {
    if (lock.current) return;
    lock.current = true;
    setLocked(true);
    setExitKind(reduced ? "fade" : "skip");
    setEnterDelay(reduced ? 0 : 0.14);
    latest.current.onSkip();
    react("surprised", 600);
    later(reduced ? 150 : 300, release);
  }, [later, react, reduced, release]);

  const undo = useCallback(() => {
    if (lock.current) return;
    setExitKind("fade");
    setEnterDelay(0);
    latest.current.onUndo();
    react("surprised", 500);
  }, [react]);

  return { locked, mood, beat, flight, exitKind, enterDelay, starPending, finishing, collect, skip, undo };
}
