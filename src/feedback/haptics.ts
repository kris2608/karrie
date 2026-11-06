export function buzz(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    return;
  }
}
