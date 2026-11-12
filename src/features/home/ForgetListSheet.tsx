import { useRef } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import type { SavedList } from "../../domain/types";
import { listName } from "../../state/reducer";

export type ForgetListSheetProps = {
  list: SavedList | null;
  onCancel: () => void;
  onConfirm: (list: SavedList) => void;
};

/** Asks before wiping a list the parent saved on purpose. */
export function ForgetListSheet({ list, onCancel, onConfirm }: ForgetListSheetProps) {
  const last = useRef<SavedList | null>(null);
  if (list) last.current = list;
  const shown = list ?? last.current;
  const name = shown ? (listName(shown) ?? "Dit lijstje") : "";
  const count = shown?.items.length ?? 0;

  return (
    <Sheet open={Boolean(list)} onClose={onCancel} label="Lijstje wissen?">
      <div className="forget-list" data-testid="forget-list-sheet">
        <h2>Lijstje wissen?</h2>
        <p className="sheet-note">
          {name} met {count} {count === 1 ? "product" : "producten"} verdwijnt van dit apparaat.
        </p>
        <div className="sheet-actions">
          <PressButton variant="quiet" data-testid="forget-list-cancel" onClick={onCancel}>
            Annuleer
          </PressButton>
          <PressButton variant="primary" data-testid="forget-list-confirm" onClick={() => list && onConfirm(list)}>
            Wissen
          </PressButton>
        </div>
      </div>
    </Sheet>
  );
}
