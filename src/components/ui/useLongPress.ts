import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { buzz } from "../../feedback/haptics";

export const LONG_PRESS = { ms: 550, slop: 10 };

type Point = { x: number; y: number };

/** Framework-free timing so the rules can be tested without a DOM. */
export function createLongPress(onLongPress: () => void, onPressing: (pressing: boolean) => void, rules = LONG_PRESS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let origin: Point | null = null;
  let fired = false;

  function cancel() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (origin) onPressing(false);
    origin = null;
  }

  return {
    down(point: Point) {
      cancel();
      fired = false;
      origin = point;
      onPressing(true);
      timer = setTimeout(() => {
        timer = undefined;
        origin = null;
        fired = true;
        onPressing(false);
        onLongPress();
      }, rules.ms);
    },
    move(point: Point) {
      if (origin && Math.hypot(point.x - origin.x, point.y - origin.y) > rules.slop) cancel();
    },
    cancel,
    /** True once for the click that ends a long press, so it does not also open the item. */
    consumeClick() {
      const was = fired;
      fired = false;
      return was;
    },
  };
}

/** Elements inside a long-press area that keep their own tap meaning (steppers, arrows). */
const OPT_OUT = "[data-no-long-press]";

export function useLongPress(onLongPress: () => void, disabled = false) {
  const latest = useRef(onLongPress);
  latest.current = onLongPress;
  const [pressing, setPressing] = useState(false);
  const press = useRef<ReturnType<typeof createLongPress> | null>(null);
  press.current ??= createLongPress(
    () => {
      buzz(30);
      latest.current();
    },
    setPressing,
  );

  useEffect(() => () => press.current?.cancel(), []);

  const handlers = {
    onPointerDown(event: PointerEvent) {
      if (disabled || event.button !== 0 || (event.target as Element).closest(OPT_OUT)) return;
      press.current?.down({ x: event.clientX, y: event.clientY });
    },
    onPointerMove(event: PointerEvent) {
      press.current?.move({ x: event.clientX, y: event.clientY });
    },
    onPointerUp: () => press.current?.cancel(),
    onPointerLeave: () => press.current?.cancel(),
    onPointerCancel: () => press.current?.cancel(),
    onContextMenu(event: MouseEvent) {
      if (!disabled && !(event.target as Element).closest(OPT_OUT)) event.preventDefault();
    },
    onClickCapture(event: MouseEvent) {
      if (press.current?.consumeClick()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };

  return { pressing, handlers };
}
