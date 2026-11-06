import { motion } from "motion/react";
import { press } from "../../motion/variants";

export function BarcodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="barcode-icon">
      <path d="M3 8V5.5A1.5 1.5 0 0 1 4.5 4H7M17 4h2.5A1.5 1.5 0 0 1 21 5.5V8M21 16v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H4.5A1.5 1.5 0 0 1 3 18.5V16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7 8v8M10 8v8M12.5 8v8M15.5 8v8M17.5 8v8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function ScanButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      className="scan-button"
      aria-label="Scan barcode"
      data-testid="scan-button"
      whileTap={press.whileTap}
      transition={press.transition}
      onClick={onClick}
    >
      <BarcodeIcon />
    </motion.button>
  );
}
