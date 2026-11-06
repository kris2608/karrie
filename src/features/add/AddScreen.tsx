import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORIES } from "../../domain/categories";
import { normalize } from "../../domain/matchProduct";
import type { CategoryId, Product } from "../../domain/types";
import { products } from "../../data/catalog";
import { ProductArt } from "../../components/ProductArt";
import { TopBar } from "../../components/TopBar";
import { PressButton } from "../../components/ui/PressButton";
import { PhotoButton, ScanButton } from "../../components/ui/ScanButton";
import { Sheet } from "../../components/ui/Sheet";
import { Toast, useNotice } from "../../components/ui/Toast";
import { ScanFlow } from "../scanner/ScanFlow";
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
  const [scanOpen, setScanOpen] = useState(false);
  const photo = useRef<PhotoFlowHandle>(null);
  const { notice, show, dismiss } = useNotice();

  const count = adventure && adventure.phase !== "done" ? adventure.items.length : 0;
  const onList = useMemo(() => {
    const amounts = new Map<string, number>();
    if (!adventure || adventure.phase === "done") return amounts;
    for (const item of adventure.items) {
      if (item.status === "found") continue;
      amounts.set(item.productId, (amounts.get(item.productId) ?? 0) + item.quantity);
    }
    return amounts;
  }, [adventure]);

  const needle = normalize(query);
  const activeTab = needle ? null : category;
  const visible = useMemo(
    () => products.filter((product) => matches(product, needle) && (needle || category === "all" || product.category === category)),
    [category, needle],
  );

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
          <ScanButton onClick={() => setScanOpen(true)} />
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
        {visible.map((product) => {
          const quantity = onList.get(product.id) ?? 0;
          const pop = burst?.id === product.id ? burst : null;
          return (
            <motion.button
              key={product.id}
              type="button"
              className={quantity ? "product-card is-added" : "product-card"}
              style={{ ["--blob" as string]: TINT[product.category] }}
              aria-label={quantity ? `${product.name}, ${quantity} op de lijst` : product.name}
              whileTap={{ scale: 0.94 }}
              transition={{ duration: 0.09 }}
              onClick={() => addProduct(product)}
            >
              <motion.span
                key={pop ? pop.token : "still"}
                className="card-art"
                initial={pop ? { scale: 1 } : false}
                animate={pop ? { scale: [1, 1.24, 0.94, 1], rotate: [0, -6, 3, 0] } : { scale: 1 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                <ProductArt id={product.id} />
              </motion.span>
              <span className="card-name">{product.name}</span>
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
        })}
      </div>
      {visible.length === 0 && <p className="empty">Niets gevonden. Probeer een ander woord.</p>}

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

      <ScanFlow
        open={scanOpen}
        items={adventure && adventure.phase !== "done" ? adventure.items : []}
        onClose={() => setScanOpen(false)}
        onDone={(message) => {
          show(message);
          playPop();
          buzz(8);
        }}
        onEdit={(itemId) => navigate("/controleren", { state: { editItem: itemId } })}
      />
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
