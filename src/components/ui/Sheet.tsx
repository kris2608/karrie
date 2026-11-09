import { AnimatePresence, motion, useDragControls } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { sheetUp } from "../../motion/variants";

const DISMISS_OFFSET = 110;
const DISMISS_VELOCITY = 650;

type SheetProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
};

export function Sheet({ open, onClose, label, children }: SheetProps) {
  const dragControls = useDragControls();

  function startDismissDrag(event: PointerEvent) {
    dragControls.start(event);
  }

  function startBodyDrag(event: PointerEvent<HTMLDivElement>) {
    const body = event.currentTarget;
    if (body.scrollHeight > body.clientHeight + 1) return;
    const target = event.target as Element;
    if (target.closest("button, a, input, textarea, select, label, [role='button']")) return;
    startDismissDrag(event);
  }

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
          <motion.div
            className="sheet-card"
            variants={sheetUp}
            initial="hidden"
            animate="shown"
            exit="gone"
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.72 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
            }}
          >
            <div className="sheet-handle" onPointerDown={startDismissDrag}>
              <span className="sheet-grip" aria-hidden="true" />
            </div>
            <div className="sheet-body" onPointerDown={startBodyDrag}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
