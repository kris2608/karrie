import { AnimatePresence } from "motion/react";
import { lazy, Suspense, useState } from "react";
import type { AdventureItem } from "../../domain/types";
import type { LookupOutcome, ScanOutcome } from "./BarcodeScanner";
import { ScanResultSheet } from "./ScanResultSheet";

export const LazyScanner = lazy(() => import("./BarcodeScanner").then((module) => ({ default: module.BarcodeScanner })));

type ScanFlowProps = {
  open: boolean;
  target?: AdventureItem;
  items: AdventureItem[];
  onClose: () => void;
  onDone: (message: string) => void;
  onEdit?: (itemId: string) => void;
};

/** Parent-side scanning: add a product, or give an existing item its packaging. */
export function ScanFlow({ open, target, items, onClose, onDone, onEdit }: ScanFlowProps) {
  const [result, setResult] = useState<LookupOutcome | null>(null);
  const [rescan, setRescan] = useState(0);
  const scanning = open && !result;

  function handle(outcome: ScanOutcome) {
    if (outcome.kind === "lookup") setResult(outcome.result);
  }

  function finish() {
    setResult(null);
    onClose();
  }

  return (
    <>
      <AnimatePresence>
        {scanning && (
          <Suspense key={rescan} fallback={<div className="scanner" aria-busy="true" />}>
            <LazyScanner mode={target ? "replace-product" : "add-product"} target={target} onResult={handle} onClose={finish} />
          </Suspense>
        )}
      </AnimatePresence>
      <ScanResultSheet
        result={open ? result : null}
        target={target}
        items={items}
        onClose={finish}
        onRescan={() => {
          setResult(null);
          setRescan((value) => value + 1);
        }}
        onDone={(message) => {
          finish();
          onDone(message);
        }}
        onEdit={
          onEdit &&
          ((itemId) => {
            finish();
            onEdit(itemId);
          })
        }
      />
    </>
  );
}
