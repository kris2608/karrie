import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORIES } from "../../domain/categories";
import { normalize } from "../../domain/matchProduct";
import type { AdventureItem, CategoryId, Product } from "../../domain/types";
import { productById, products } from "../../data/catalog";
import { hasPhoto, ItemArt } from "../../components/ItemArt";
import { ProductArt } from "../../components/ProductArt";
import { TopBar } from "../../components/TopBar";
import { PhotoButton } from "../../components/ui/PhotoButton";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { Toast, useNotice } from "../../components/ui/Toast";
import { useLongPress } from "../../components/ui/useLongPress";
import { PhotoFlow, type PhotoFlowHandle } from "../photo/PhotoFlow";
import { buzz } from "../../feedback/haptics";
import { playPop } from "../../feedback/sound";
import { badgeSpring, spring } from "../../motion/variants";
import { recognizeList } from "../../state/reducer";
import { useAdventure } from "../../state/AdventureContext";

type DraftLine = {
  key: string;
  quantity: number;
  query: string;
  product: Product | null;
};

const TINT: Record<CategoryId, string> = {
  produce: "#dff5cf",
  bakery: "#ffe9c2",
  pantry: "#ffe0da",
  dairy: "#d9f0ff",
  frozen: "#dcf3f6",
  household: "#ece3ff",
};

type OnList = { item: AdventureItem; quantity: number };

type GridTileProps = {
  name: string;
  category: CategoryId;
  art: ReactNode;
  quantity: number;
  pop: { token: number } | null;
  onAdd: () => void;
  onRemove: () => void;
};

function GridTile({ name, category, art, quantity, pop, onAdd, onRemove }: GridTileProps) {
  const { pressing, handlers } = useLongPress(onRemove, quantity === 0);
  const classes = ["product-card", quantity ? "is-added" : "", pressing ? "is-pressing" : ""].filter(Boolean).join(" ");
  return (
    <motion.button
      type="button"
      className={classes}
      style={{ ["--blob" as string]: TINT[category] }}
      aria-label={quantity ? `${name}, ${quantity} op de lijst. Lang drukken om te verwijderen` : name}
      data-testid="product-card"
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.09 }}
      onClick={onAdd}
      {...handlers}
    >
      <motion.span
        key={pop ? pop.token : "still"}
        className="card-art"
        initial={pop ? { scale: 1 } : false}
        animate={pop ? { scale: [1, 1.24, 0.94, 1], rotate: [0, -6, 3, 0] } : { scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        {art}
      </motion.span>
      <span className="card-name">{name}</span>
      <AnimatePresence>
        {quantity > 0 && (
          <motion.span key="badge" className="card-badge" variants={badgeSpring} initial="hidden" animate="shown" exit="gone">
            <motion.span key={quantity} initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={spring}>
              {quantity}
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>
      {pop && (
        <motion.span
          key={`burst-${pop.token}`}
          className="card-burst"
          aria-hidden="true"
          initial={{ scale: 0.2, opacity: 0, y: 0 }}
          animate={{ scale: [0.2, 1.15, 0.7], opacity: [0, 1, 0], y: [0, -4, -26] }}
          transition={{ duration: 0.6, times: [0, 0.35, 1], ease: "easeOut" }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M6 12.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
      )}
    </motion.button>
  );
}

function matches(product: Product, needle: string) {
  return !needle || normalize(product.name).includes(needle) || product.aliases.some((alias) => normalize(alias).includes(needle));
}

export function AddScreen() {
  const { adventure, dispatch } = useAdventure();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | "all">("produce");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [burst, setBurst] = useState<{ id: string; token: number } | null>(null);
  const photo = useRef<PhotoFlowHandle>(null);
  const { notice, show, dismiss } = useNotice();

  const count = adventure && adventure.phase !== "done" ? adventure.items.length : 0;
  const onList = useMemo(() => {
    const entries = new Map<string, OnList>();
    if (!adventure || adventure.phase === "done") return entries;
    for (const item of adventure.items) {
      if (item.status === "found") continue;
      const entry = entries.get(item.productId);
      entries.set(item.productId, entry ? { item: hasPhoto(entry.item) ? entry.item : item, quantity: entry.quantity + item.quantity } : { item, quantity: item.quantity });
    }
    return entries;
  }, [adventure]);

  const needle = normalize(query);
  const activeTab = needle ? null : category;
  const visible = useMemo(
    () => products.filter((product) => matches(product, needle) && (needle || category === "all" || product.category === category)),
    [category, needle],
  );
  const extras = [...onList.values()].filter(
    ({ item }) => !productById(item.productId) && (needle ? normalize(item.name).includes(needle) : category === "all" || item.category === category),
  );

  function addMore(item: AdventureItem) {
    dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity + 1 });
    setBurst((current) => ({ id: item.productId, token: (current?.token ?? 0) + 1 }));
    playPop();
    buzz(8);
  }

  function removeProduct(productId: string) {
    if (!adventure) return;
    const removed = adventure.items.flatMap((item, index) => (item.productId === productId && item.status !== "found" ? [{ item, index }] : []));
    if (!removed.length) return;
    for (const { item } of removed) dispatch({ type: "remove-item", itemId: item.id });
    show(`${removed[0].item.name} verwijderd`, {
      label: "Ongedaan maken",
      run: () => removed.forEach(({ item, index }) => dispatch({ type: "insert-item", item, index })),
    });
  }

  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), 620);
    return () => window.clearTimeout(timer);
  }, [burst]);

  function addProduct(product: Product) {
    dispatch({ type: "add-product", product });
    setBurst((current) => ({ id: product.id, token: (current?.token ?? 0) + 1 }));
    playPop();
    buzz(8);
  }

  function recognize() {
    setLines(
      recognizeList(pasteText).map((line) => ({
        key: crypto.randomUUID(),
        quantity: line.quantity,
        query: line.query,
        product: line.product,
      })),
    );
  }

  function commitLines(nextLines: DraftLine[]) {
    const matched = nextLines.flatMap((line) => (line.product ? [{ product: line.product, quantity: line.quantity }] : []));
    if (matched.length) {
      dispatch({ type: "add-lines", lines: matched });
      playPop();
    }
    const unmatched = nextLines.filter((line) => !line.product);
    setLines(unmatched);
    if (!unmatched.length) {
      setPasteOpen(false);
      setPasteText("");
    }
  }

  const tabs: { id: CategoryId | "all"; label: string }[] = [{ id: "all", label: "Alles" }, ...CATEGORIES.map((entry) => ({ id: entry.id, label: entry.short }))];

  return (
    <main className="screen screen-add">
      <div className="add-head">
        <TopBar title="Wat nemen we mee?" />
        <div className="search-row">
          <label className="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Zoek een product</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Zoek brood, melk…"
              enterKeyHint="search"
              autoComplete="off"
              type="search"
            />
          </label>
          <PhotoButton onClick={() => photo.current?.open()} />
        </div>
        <div className="tabs" role="tablist" aria-label="Categorieën">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? "tab is-active" : "tab"}
                onClick={(event) => {
                  setCategory(tab.id);
                  setQuery("");
                  event.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }}
              >
                {active && <motion.span layoutId="tab-pill" className="tab-pill" transition={spring} />}
                <span className="tab-label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="product-grid">
        {extras.map((entry) => (
          <GridTile
            key={entry.item.id}
            name={entry.item.name}
            category={entry.item.category}
            art={<ItemArt item={entry.item} />}
            quantity={entry.quantity}
            pop={burst?.id === entry.item.productId ? burst : null}
            onAdd={() => addMore(entry.item)}
            onRemove={() => removeProduct(entry.item.productId)}
          />
        ))}
        {visible.map((product) => {
          const entry = onList.get(product.id);
          return (
            <GridTile
              key={product.id}
              name={product.name}
              category={product.category}
              art={entry ? <ItemArt item={entry.item} /> : <ProductArt id={product.id} />}
              quantity={entry?.quantity ?? 0}
              pop={burst?.id === product.id ? burst : null}
              onAdd={() => addProduct(product)}
              onRemove={() => removeProduct(product.id)}
            />
          );
        })}
      </div>
      {visible.length === 0 && extras.length === 0 && <p className="empty">Niets gevonden. Probeer een ander woord.</p>}
      {count > 0 && <p className="add-hint">Lang drukken haalt een product van de lijst.</p>}

      <div className="dock dock-fixed">
        <PressButton variant="quiet" data-testid="paste" onClick={() => setPasteOpen(true)}>
          Lijst plakken
        </PressButton>
        <PressButton variant="primary" disabled={count === 0} onClick={() => navigate("/controleren")}>
          Controleer
          {count > 0 && (
            <motion.span key={count} className="dock-count" initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={spring}>
              {count}
            </motion.span>
          )}
        </PressButton>
      </div>

      <Sheet open={pasteOpen} onClose={() => setPasteOpen(false)} label="Lijst plakken">
        <h2>Plak je lijst</h2>
        <textarea
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={"melk\n2x brood\n- 3 appels"}
          rows={5}
        />
        <PressButton variant="secondary" wide data-testid="recognize" onClick={recognize}>
          Herken producten
        </PressButton>
        <ul className="paste-lines">
          {lines.map((line) => (
            <li key={line.key}>
              {line.product ? (
                <div className="paste-match">
                  <ProductArt id={line.product.id} />
                  <span>
                    {line.quantity}× {line.product.name}
                  </span>
                  <button type="button" className="text-button" onClick={() => setLines(lines.filter((entry) => entry.key !== line.key))}>
                    Weg
                  </button>
                </div>
              ) : (
                <AssignLine
                  line={line}
                  onPick={(product) => setLines(lines.map((entry) => (entry.key === line.key ? { ...entry, product } : entry)))}
                  onDrop={() => setLines(lines.filter((entry) => entry.key !== line.key))}
                />
              )}
            </li>
          ))}
        </ul>
        <div className="sheet-actions">
          <PressButton variant="quiet" onClick={() => setPasteOpen(false)}>
            Sluiten
          </PressButton>
          <PressButton variant="primary" data-testid="accept-paste" disabled={!lines.some((line) => line.product)} onClick={() => commitLines(lines)}>
            Zet op de lijst
          </PressButton>
        </div>
      </Sheet>

      <PhotoFlow
        ref={photo}
        items={adventure && adventure.phase !== "done" ? adventure.items : []}
        onDone={(message) => {
          show(message);
          playPop();
          buzz(8);
        }}
      />
      <Toast notice={notice} onDismiss={dismiss} />
    </main>
  );
}

function AssignLine({ line, onPick, onDrop }: { line: DraftLine; onPick: (product: Product) => void; onDrop: () => void }) {
  const [query, setQuery] = useState(line.query);
  const needle = normalize(query);
  const suggestions = products.filter((product) => matches(product, needle)).slice(0, 4);

  return (
    <div className="unmatched">
      <p>Niet herkend: {line.query}</p>
      <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`Kies een product voor ${line.query}`} />
      <div className="chips">
        {suggestions.map((product) => (
          <button key={product.id} type="button" className="chip" onClick={() => onPick(product)}>
            {product.name}
          </button>
        ))}
        <button type="button" className="chip chip-quiet" onClick={onDrop}>
          Weglaten
        </button>
      </div>
    </div>
  );
}
