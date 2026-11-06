import { motion } from "motion/react";
import { press } from "../../motion/variants";

export function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="camera-icon">
      <path
        d="M4.5 7.5h3l1.6-2.2a1.5 1.5 0 0 1 1.2-.6h3.4a1.5 1.5 0 0 1 1.2.6l1.6 2.2h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.3" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.1" />
    </svg>
  );
}

export function PhotoButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      className="scan-button photo-button"
      aria-label="Foto maken"
      data-testid="photo-button"
      whileTap={press.whileTap}
      transition={press.transition}
      onClick={onClick}
    >
      <CameraIcon />
    </motion.button>
  );
}
