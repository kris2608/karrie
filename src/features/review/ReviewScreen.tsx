import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { categoryLabel } from "../../domain/categories";
import type { AdventureItem, CategoryId } from "../../domain/types";
import { ItemArt } from "../../components/ItemArt";
import { TopBar } from "../../components/TopBar";
import { PressButton } from "../../components/ui/PressButton";
import { Toast, useNotice } from "../../components/ui/Toast";
import { spring } from "../../motion/variants";
import { warmImages } from "../../services/off/warmImages";
import { useAdventure } from "../../state/AdventureContext";
import { ScanFlow } from "../scanner/ScanFlow";
import { PhotoFlow, type PhotoFlowHandle } from "../photo/PhotoFlow";
import { ItemSheet } from "./ItemSheet";

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={up ? "M6 14.5L12 8.5l6 6" : "M6 9.5l6 6 6-6"} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReviewScreen() {
  const { adventure, dispatch } = useAdventure();
  const navigate = useNavigate();
  const location = useLocation();
  const [editId, setEditId] = useState<string | null>(() => (location.state as { editItem?: string } | null)?.editItem ?? null);
  const [scanTargetId, setScanTargetId] = useState<string | null>(null);
  const photo = useRef<PhotoFlowHandle>(null);
  const { notice, show, dismiss } = useNotice();

  useEffect(() => {
    if ((location.state as { editItem?: string } | null)?.editItem) navigate(".", { replace: true, state: null });
  }, [location.state, navigate]);

  if (!adventure || adventure.phase === "done") return <Missing />;

  const groups = adventure.categoryOrder
    .map((category) => ({
      category,
      items: adventure.items.filter((item) => item.category === category && item.status !== "found"),
    }))
    .filter((group) => group.items.length);

  const hasOpen = adventure.items.some((item) => item.status !== "found");
  const editing = adventure.items.find((item) => item.id === editId) ?? null;
  const scanTarget = adventure.items.find((item) => item.id === scanTargetId);

  function saveForLater() {
    dispatch({ type: "save-favorite" });
    navigate("/", { state: { notice: "Lijstje bewaard" } });
  }

  function start() {
    if (!adventure) return;
    warmImages(adventure.items);
    if (adventure.phase !== "shopping") dispatch({ type: "start-shopping" });
    navigate("/winkel");
  }

  function remove(item: AdventureItem) {
    if (!adventure) return;
    const index = adventure.items.findIndex((entry) => entry.id === item.id);
    dispatch({ type: "remove-item", itemId: item.id });
    setEditId(null);
    show(`${item.name} verwijderd`, { label: "Ongedaan maken", run: () => dispatch({ type: "insert-item", item, index }) });
  }

  function moveGroup(category: CategoryId, direction: -1 | 1) {
    if (!adventure) return;
    const visible = groups.map((group) => group.category);
    const neighbor = visible[visible.indexOf(category) + direction];
    if (!neighbor) return;
    const order = adventure.categoryOrder.slice();
    const from = order.indexOf(category);
    const to = order.indexOf(neighbor);
    [order[from], order[to]] = [order[to], order[from]];
    dispatch({ type: "set-category-order", order });
  }

  return (
    <main className="screen screen-review">
      <TopBar title="Klopt het lijstje?" to="/toevoegen" />
      {groups.length === 0 && (
        <p className="empty">
          Nog geen producten. <Link to="/toevoegen">Voeg er een paar toe.</Link>
        </p>
      )}
      {groups.map((group, groupIndex) => (
        <motion.section key={group.category} layout="position" transition={spring} className="category-block">
          <header>
            <h2>{categoryLabel(group.category)}</h2>
            <div className="mini-actions">
              <button type="button" className="round-button round-s" aria-label="Categorie omhoog" disabled={groupIndex === 0} onClick={() => moveGroup(group.category, -1)}>
                <Arrow up />
              </button>
              <button
                type="button"
                className="round-button round-s"
                aria-label="Categorie omlaag"
                disabled={groupIndex === groups.length - 1}
                onClick={() => moveGroup(group.category, 1)}
              >
                <Arrow />
              </button>
            </div>
          </header>
          <ul>
            <AnimatePresence initial={false}>
              {group.items.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  first={index === 0}
                  last={index === group.items.length - 1}
                  onEdit={() => setEditId(item.id)}
                  onRemove={() => remove(item)}
                />
              ))}
            </AnimatePresence>
          </ul>
        </motion.section>
      ))}
      <div className="dock dock-fixed">
        {adventure.phase === "draft" && (
          <PressButton variant="quiet" size="l" data-testid="save-later" disabled={!hasOpen} onClick={saveForLater}>
            Bewaren
          </PressButton>
        )}
        <PressButton variant="primary" size="l" wide data-testid="start" disabled={!hasOpen} onClick={start}>
          {adventure.phase === "shopping" ? "Verder winkelen" : "Start avontuur"}
        </PressButton>
      </div>

      <ItemSheet
        item={editing}
        onClose={() => setEditId(null)}
        onRestore={() => {
          if (!editing) return;
          dispatch({ type: "restore-generic", itemId: editing.id });
          show(`${editing.name} heeft weer een Karrie-tekening`);
        }}
        onScan={() => {
          if (!editing) return;
          setScanTargetId(editing.id);
          setEditId(null);
        }}
        onPhoto={() => {
          if (!editing) return;
          photo.current?.open(editing);
          setEditId(null);
        }}
        onRemove={() => editing && remove(editing)}
      />
      <PhotoFlow ref={photo} items={adventure.items} onDone={show} />
      <ScanFlow
        open={Boolean(scanTarget)}
        target={scanTarget}
        items={adventure.items}
        onClose={() => setScanTargetId(null)}
        onDone={show}
      />
      <Toast notice={notice} onDismiss={dismiss} />
    </main>
  );
}

function ItemRow({ item, first, last, onEdit, onRemove }: { item: AdventureItem; first: boolean; last: boolean; onEdit: () => void; onRemove: () => void }) {
  const { dispatch } = useAdventure();
  const detail = [item.brand, item.packageSize].filter(Boolean).join(" · ");
  return (
    <motion.li
      layout="position"
      className="item-row"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.16 } }}
      transition={spring}
    >
      <button type="button" className="item-art-button" aria-label={`Bewerk ${item.name}`} data-testid="edit-item" onClick={onEdit}>
        <ItemArt item={item} />
      </button>
      <div className="item-main">
        <strong>{item.name}</strong>
        {detail && <small className="item-detail">{detail}</small>}
        <div className="stepper">
          <button type="button" aria-label="Minder" disabled={item.quantity <= 1} onClick={() => dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity - 1 })}>
            −
          </button>
          <span>{item.quantity}</span>
          <button type="button" aria-label="Meer" onClick={() => dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity + 1 })}>
            +
          </button>
        </div>
      </div>
      <div className="row-actions">
        <button type="button" className="round-button round-s" aria-label="Omhoog" disabled={first} onClick={() => dispatch({ type: "move-item", itemId: item.id, direction: -1 })}>
          <Arrow up />
        </button>
        <button type="button" className="round-button round-s" aria-label="Omlaag" disabled={last} onClick={() => dispatch({ type: "move-item", itemId: item.id, direction: 1 })}>
          <Arrow />
        </button>
        <button type="button" className="round-button round-s round-danger" aria-label="Verwijder" onClick={onRemove}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </motion.li>
  );
}

function Missing() {
  return (
    <main className="screen">
      <TopBar title="Lijstje" />
      <p className="empty">Er is nog geen lijstje.</p>
    </main>
  );
}
