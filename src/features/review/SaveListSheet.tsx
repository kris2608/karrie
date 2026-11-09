import { useEffect, useState } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import type { Adventure } from "../../domain/types";
import { listName } from "../../state/reducer";

type SaveListSheetProps = {
  open: boolean;
  adventure: Adventure;
  /** True when this adventure already has a favorite row with the same id. */
  editingFavorite?: boolean;
  onClose: () => void;
  /** Create or overwrite a favorite under the current adventure id. */
  onSave: (name: string, store: string) => void;
  /** Update the existing favorite without renaming. */
  onUpdate?: () => void;
  /** Save a separate favorite under a new id. */
  onSaveAsNew?: (name: string, store: string) => void;
};

/** The supermarket field stays hidden until a feature uses it; a store saved earlier is kept. */
const ASK_STORE = false;

/** Bewaren asks for an optional name; it may stay empty. Editing a favorite can update or save-as-new. */
export function SaveListSheet({ open, adventure, editingFavorite = false, onClose, onSave, onUpdate, onSaveAsNew }: SaveListSheetProps) {
  const [name, setName] = useState("");
  const [store, setStore] = useState("");
  const [asNew, setAsNew] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(listName(adventure) ?? "");
    setStore(adventure.store ?? "");
    setAsNew(false);
  }, [open, adventure.id]);

  const naming = !editingFavorite || asNew;
  const title = editingFavorite ? (asNew ? "Bewaar als nieuw" : "Lijstje bijwerken") : "Lijstje bewaren";

  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <form
        className="save-list"
        onSubmit={(event) => {
          event.preventDefault();
          if (editingFavorite && !asNew) {
            onUpdate?.();
            return;
          }
          if (editingFavorite && asNew) {
            onSaveAsNew?.(name, store);
            return;
          }
          onSave(name, store);
        }}
      >
        <h2>{title}</h2>
        {editingFavorite && !asNew && listName(adventure) && <p className="sheet-note">{listName(adventure)}</p>}
        {naming && (
          <label className="scan-field">
            <span>Naam</span>
            <input data-testid="save-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Bijvoorbeeld: Weekboodschappen" autoComplete="off" maxLength={40} enterKeyHint={ASK_STORE ? "next" : "done"} />
          </label>
        )}
        {ASK_STORE && naming && (
          <label className="scan-field">
            <span>Supermarkt</span>
            <input data-testid="save-store" value={store} onChange={(event) => setStore(event.target.value)} placeholder="Bijvoorbeeld: Albert Heijn" autoComplete="off" maxLength={40} enterKeyHint="done" />
          </label>
        )}
        <div className="sheet-actions">
          <PressButton type="button" variant="quiet" onClick={asNew ? () => setAsNew(false) : onClose}>
            {asNew ? "Terug" : "Annuleer"}
          </PressButton>
          <PressButton type="submit" variant="primary" data-testid="save-confirm">
            {editingFavorite && !asNew ? "Bewaar wijzigingen" : "Bewaar"}
          </PressButton>
        </div>
        {editingFavorite && !asNew && onSaveAsNew && (
          <PressButton type="button" variant="secondary" wide data-testid="save-as-new" onClick={() => setAsNew(true)}>
            Bewaar als nieuw
          </PressButton>
        )}
      </form>
    </Sheet>
  );
}
