import confetti from "canvas-confetti";

const COLORS = ["#ff8a1f", "#16bfb2", "#ffd23f", "#ff6b5e", "#3cc46b"];

export function celebrate() {
  const base = { disableForReducedMotion: true, colors: COLORS, ticks: 170, scalar: 0.95, zIndex: 40 };
  void confetti({ ...base, particleCount: 60, spread: 70, startVelocity: 40, origin: { x: 0.5, y: 0.45 } });
  window.setTimeout(() => {
    void confetti({ ...base, particleCount: 26, angle: 60, spread: 55, origin: { x: 0, y: 0.6 } });
    void confetti({ ...base, particleCount: 26, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } });
  }, 180);
}
