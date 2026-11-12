import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ItemArt } from "../../components/ItemArt";
import { ShareIcon } from "../../components/ui/ShareIcon";
import { Sheet } from "../../components/ui/Sheet";
import { useLongPress } from "../../components/ui/useLongPress";
import { Toast, useNotice } from "../../components/ui/Toast";
import type { Adventure, SavedList } from "../../domain/types";
import { useAdventure } from "../../state/AdventureContext";
import { listName } from "../../state/reducer";
import { ForgetListSheet } from "../home/ForgetListSheet";
import { ShareListSheet } from "../share/ShareListSheet";

export type ListsSheetProps = {
  open: boolean;
  onClose: () => void;
  /** After selecting or creating a list; default navigates to /controleren. */
  onOpened?: () => void;
};

function ListsRow({
  list,
  active,
  onOpen,
  onForget,
  onShare,
}: {
  list: SavedList;
  active: boolean;
  onOpen: () => void;
  onForget: () => void;
  onShare: () => void;
}) {
  const { pressing, handlers } = useLongPress(onForget);
  const label = listName(list) ?? list.name;
  const detail = [`${list.items.length} ${list.items.length === 1 ? "product" : "producten"}`, list.store].filter(Boolean).join(" · ");
  return (
    <li className={pressing ? "lists-row is-pressing" : "lists-row"} data-active={active ? "true" : undefined}>
      <motion.button
        type="button"
        className="lists-row-main"
        aria-current={active ? "true" : undefined}
        aria-label={`${label}, ${detail}${active ? ", huidig lijstje" : ""}. Lang drukken om te wissen`}
        data-testid="lists-row"
        whileTap={{ scale: 0.98 }}
        onClick={onOpen}
        {...handlers}
      >
        <span className="lists-row-text">
          <strong>
            {label}
            {active ? <small className="lists-active"> · huidig</small> : null}
          </strong>
        </span>
        <span className="lists-row-body">
          <span className="lists-row-art">
            {list.items.slice(0, 3).map((item, index) => (
              <ItemArt key={`${item.productId}-${index}`} item={item} />
            ))}
          </span>
          <small>{detail}</small>
        </span>
      </motion.button>
      <button type="button" className="lists-row-action" data-testid="lists-share" aria-label={`Deel ${label}`} data-no-long-press onClick={onShare}>
        <ShareIcon />
      </button>
      <button type="button" className="lists-row-action lists-row-forget" data-testid="lists-forget" aria-label={`Wis ${label}`} data-no-long-press onClick={onForget}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

function sortedLists(saved: SavedList[], adventure: Adventure | null): SavedList[] {
  const activeId = adventure?.id;
  return [...saved].sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

/** All saved shopping lists: switch, share, delete — without cluttering the main screen. */
export function ListsSheet({ open, onClose, onOpened }: ListsSheetProps) {
  const { adventure, saved, dispatch } = useAdventure();
  const navigate = useNavigate();
  const undo = useNotice();
  const [shareList, setShareList] = useState<SavedList | null>(null);
  const [forgetting, setForgetting] = useState<SavedList | null>(null);
  const lists = sortedLists(saved, adventure);

  function afterOpen() {
    onClose();
    if (onOpened) onOpened();
    else navigate("/controleren");
  }

  function openList(list: SavedList) {
    dispatch({ type: "open-saved", id: list.id });
    afterOpen();
  }

  function forgetList(list: SavedList) {
    setForgetting(null);
    const index = saved.findIndex((entry) => entry.id === list.id);
    dispatch({ type: "forget-saved", id: list.id });
    undo.show("Lijstje gewist", { label: "Ongedaan maken", run: () => dispatch({ type: "restore-saved", list, index }) });
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} label="Lijstjes">
        <div className="lists-sheet" data-testid="lists-sheet">
          <h2>Lijstjes</h2>
          <div className="lists-panel" data-testid="lists-panel">
            {lists.length === 0 ? (
              <p className="lists-empty">Nog geen bewaarde lijstjes.</p>
            ) : (
              <ul className="lists-sheet-list" aria-label="Bewaarde lijstjes">
                {lists.map((list) => (
                  <ListsRow
                    key={list.id}
                    list={list}
                    active={adventure?.id === list.id}
                    onOpen={() => openList(list)}
                    onForget={() => setForgetting(list)}
                    onShare={() => setShareList(list)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </Sheet>
      <ShareListSheet open={Boolean(shareList)} source={shareList} onClose={() => setShareList(null)} />
      <ForgetListSheet list={forgetting} onCancel={() => setForgetting(null)} onConfirm={forgetList} />
      <Toast notice={undo.notice} onDismiss={undo.dismiss} />
    </>
  );
}
