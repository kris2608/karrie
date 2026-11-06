import type { Transition, Variants } from "motion/react";

export const spring: Transition = { type: "spring", stiffness: 520, damping: 30 };
export const softSpring: Transition = { type: "spring", stiffness: 260, damping: 22 };
export const easeOut = [0.22, 1, 0.36, 1] as const;

export const press = {
  whileTap: { scale: 0.95, y: 2 },
  transition: { duration: 0.09 },
};

export const popIn: Variants = {
  hidden: { scale: 0.4, opacity: 0 },
  shown: { scale: 1, opacity: 1, transition: spring },
  gone: { scale: 0.4, opacity: 0, transition: { duration: 0.12 } },
};

export const cardEnter: Variants = {
  hidden: { y: 14, opacity: 0 },
  shown: (index: number = 0) => ({
    y: 0,
    opacity: 1,
    transition: { ...softSpring, delay: Math.min(index, 10) * 0.025 },
  }),
};

export const productEnter: Variants = {
  hidden: { scale: 0.6, y: 24, opacity: 0, rotate: -6 },
  shown: (delay: number = 0) => ({
    scale: 1,
    y: 0,
    opacity: 1,
    rotate: 0,
    transition: { ...softSpring, delay },
  }),
};

export const productExit: Variants = {
  found: { opacity: 0, transition: { duration: 0 } },
  skip: { x: -320, rotate: -14, opacity: 0, transition: { duration: 0.22, ease: easeOut } },
  fade: { opacity: 0, transition: { duration: 0.15 } },
};

export const badgeSpring: Variants = {
  hidden: { scale: 0, opacity: 0 },
  shown: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 700, damping: 18 } },
  gone: { scale: 0, opacity: 0, transition: { duration: 0.1 } },
};

/** Bonus mission: the two cards slide in from their own side, the star chip pops last. */
export const missionCard: Variants = {
  hidden: (side: number = 0) => ({ x: side * 60, y: 18, rotate: side * 6, opacity: 0 }),
  shown: (side: number = 0) => ({ x: 0, y: 0, rotate: side * -2, opacity: 1, transition: { ...softSpring, delay: 0.12 + Math.abs(side) * 0.08 } }),
};

export const missionChip: Variants = {
  hidden: { scale: 0, rotate: -30, opacity: 0 },
  shown: { scale: [0, 1.25, 1], rotate: 0, opacity: 1, transition: { delay: 0.45, duration: 0.45 } },
};

export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.15 } },
};

export const sheetUp: Variants = {
  hidden: { y: "100%" },
  shown: { y: 0, transition: { type: "spring", stiffness: 380, damping: 36 } },
  gone: { y: "100%", transition: { duration: 0.18, ease: easeOut } },
};
