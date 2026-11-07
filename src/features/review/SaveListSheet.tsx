import { useEffect, useState } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import type { Adventure } from "../../domain/types";
import { listName } from "../../state/reducer";

type SaveListSheetProps = {
  open: boolean;
  adventure: Adventure;
  onClose: () => void;
  onSave: (name: string, store: string) => void;
};

/** The supermarket field stays hidden until a feature uses it; a store saved earlier is kept. */
const ASK_STORE = false;

/** Bewaren asks for an optional name; it may stay empty. */
export function SaveListSheet({ open, adventure, onClose, onSave }: SaveListSheetProps) {
  const [name, setName] = useState("");
  const [store, setStore] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(listName(adventure) ?? "");
    setStore(adventure.store ?? "");
  }, [open, adventure.id]);

  return (
    <Sheet open={open} onClose={onClose} label="Lijstje bewaren">
      <form
        className="save-list"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name, store);
        }}
      >
        <h2>Lijstje bewaren</h2>
        <label className="scan-field">
          <span>Naam</span>
          <input data-testid="save-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Bijvoorbeeld: Weekboodschappen" autoComplete="off" maxLength={40} enterKeyHint={ASK_STORE ? "next" : "done"} />
        </label>
        {ASK_STORE && (
          <label className="scan-field">
            <span>Supermarkt</span>
            <input data-testid="save-store" value={store} onChange={(event) => setStore(event.target.value)} placeholder="Bijvoorbeeld: Albert Heijn" autoComplete="off" maxLength={40} enterKeyHint="done" />
          </label>
        )}
        <div className="sheet-actions">
          <PressButton type="button" variant="quiet" onClick={onClose}>
            Annuleer
          </PressButton>
          <PressButton type="submit" variant="primary" data-testid="save-confirm">
            Bewaar
          </PressButton>
        </div>
      </form>
    </Sheet>
  );
}
