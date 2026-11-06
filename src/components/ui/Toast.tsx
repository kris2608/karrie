import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { softSpring } from "../../motion/variants";

export type Notice = { id: number; text: string; action?: { label: string; run: () => void } };

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const show = useCallback((text: string, action?: Notice["action"]) => setNotice({ id: Date.now() + Math.random(), text, action }), []);
  const dismiss = useCallback(() => setNotice(null), []);
  return { notice, show, dismiss };
}

export function Toast({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismiss, notice.action ? 5000 : 2400);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.id}
          className={notice.action ? "toast toast-action" : "toast"}
          role="status"
          data-testid="toast"
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={softSpring}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{notice.text}</span>
          {notice.action && (
            <button
              type="button"
              className="toast-button"
              data-testid="toast-undo"
              onClick={() => {
                notice.action?.run();
                onDismiss();
              }}
            >
              {notice.action.label}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
