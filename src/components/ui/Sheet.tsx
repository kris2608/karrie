import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { sheetUp } from "../../motion/variants";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
};

export function Sheet({ open, onClose, label, children }: SheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
        >
          <motion.div className="sheet-card" variants={sheetUp} initial="hidden" animate="shown" exit="gone">
            <span className="sheet-grip" aria-hidden="true" />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
