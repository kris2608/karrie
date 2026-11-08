import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORIES } from "../../domain/categories";
import { customName, customProductId, suggestion } from "../../domain/customProduct";
import { normalize } from "../../domain/matchProduct";
import { matchesMine, mineKey } from "../../domain/mine";
import type { AdventureItem, CategoryId, Product, SavedItem } from "../../domain/types";
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
import { activeSection } from "./sectionSpy";
import { NewProductSheet, type NewProductChoice } from "./NewProductSheet";
import { Attribution, OfferTag, TagIcon } from "../offers/OfferTag";
import { RetailerPicker } from "../offers/RetailerPicker";
import { RETAILERS, retailerName, type RetailerId } from "../../domain/retailers";
import { useOfferViews } from "../../storage/offers";
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
  meat: "#ffd5d0",
  breakfast: "#ffe8c8",
  pantry: "#ffe0da",
  dairy: "#d9f0ff",
  drinks: "#d4e8ff",
  frozen: "#dcf3f6",
  household: "#ece3ff",
};

type OnList = { item: AdventureItem; quantity: number };

const NO_ITEMS: AdventureItem[] = [];

/** The green check rises out of the tile, slow enough for a child to follow. */
const BURST_MS = 1100;

/** A category counts as "in view" once its heading is in the top third of what's visible under the sticky header. */
const SPY_SHARE = 0.3;
/** Fallback for browsers without `scrollend`: after a tab jump, follow the scroll again. */
const JUMP_MS = 1000;

type GridTileProps = {
  name: string;
  category: CategoryId;
  art: ReactNode;
  quantity: number;
  pop: { token: number } | null;
  onAdd: () => void;
  onRemove: () => void;
  /** Mijn producten can always be long-pressed: that also forgets them. */
  mine?: boolean;
  /** Only reliable offers show on a tile; doubtful ones stay on the parent's list screen. */
  offer?: RetailerId;
};

function GridTile({ name, category, art, quantity, pop, onAdd, onRemove, mine = false, offer }: GridTileProps) {
  const { pressing, handlers } = useLongPress(onRemove, quantity === 0 && !mine);
  const classes = ["product-card", quantity ? "is-added" : "", pressing ? "is-pressing" : "", mine ? "is-mine" : ""].filter(Boolean).join(" ");
  const deal = offer && quantity ? `, in de aanbieding bij ${retailerName(offer)}` : "";
  const label = mine
    ? `${name}, uit Mijn producten${quantity ? `, ${quantity} op de lijst` : ""}${deal}. Lang drukken om te vergeten`
    : quantity
      ? `${name}, ${quantity} op de lijst${deal}. Lang drukken om te verwijderen`
      : name;
  return (
    <motion.button
      type="button"
      className={classes}
      style={{ ["--blob" as string]: TINT[category] }}
      aria-label={label}
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
      {mine && (
        <span className="card-mine" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" />
          </svg>
        </span>
      )}
      {offer && quantity > 0 && <OfferTag shown="deal" retailer={offer} className="card-offer" compact />}
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
          animate={{ scale: [0.2, 1.2, 1, 0.8], opacity: [0, 1, 1, 0], y: [0, -10, -60, -110] }}
          transition={{ duration: BURST_MS / 1000, times: [0, 0.2, 0.65, 1], ease: "easeOut" }}
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
  const { adventure, mine, settings, dispatch } = useAdventure();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<CategoryId>(CATEGORIES[0].id);
  const reduced = useReducedMotion() ?? false;
  const headRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState<string | null>(null);
  /** Keeps the sheet filled while it fades out. */
  const [shown, setShown] = useState<{ name: string; token: number } | null>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const sectionRefs = useRef<Partial<Record<CategoryId, HTMLElement | null>>>({});
  const jumping = useRef<(() => void) | null>(null);
  const pendingJump = useRef<CategoryId | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [burst, setBurst] = useState<{ id: string; token: number } | null>(null);
  const [pickingStore, setPickingStore] = useState(false);
  const photo = useRef<PhotoFlowHandle>(null);
  const { notice, show, dismiss } = useNotice();
  const draft = adventure?.phase === "draft" ? adventure : null;
  const retailer = draft ? draft.retailer : settings.retailer;
  const { views, deals } = useOfferViews(draft?.items ?? NO_ITEMS, draft?.retailer);
  const offerOn = (item: AdventureItem | undefined) => (item && draft?.retailer && views.get(item.id)?.shown === "deal" ? draft.retailer : undefined);

  const count = adventure && adventure.phase !== "done" ? adventure.items.length : 0;
  const mineKeys = useMemo(() => new Set(mine.map(mineKey)), [mine]);
  /** A remembered product counts on its own tile, not on the catalog tile of the same type. */
  const tileOf = (item: AdventureItem) => (mineKeys.has(mineKey(item)) ? mineKey(item) : item.productId);
  const onList = useMemo(() => {
    const entries = new Map<string, OnList>();
    if (!adventure || adventure.phase === "done") return entries;
    for (const item of adventure.items) {
      if (item.status === "found") continue;
      const tile = mineKeys.has(mineKey(item)) ? mineKey(item) : item.productId;
      const entry = entries.get(tile);
      entries.set(tile, entry ? { item: hasPhoto(entry.item) ? entry.item : item, quantity: entry.quantity + item.quantity } : { item, quantity: item.quantity });
    }
    return entries;
  }, [adventure, mineKeys]);

  const needle = normalize(query);
  const visible = useMemo(() => products.filter((product) => matches(product, needle)), [needle]);
  const mineVisible = mine.filter((entry) => matchesMine(entry, needle));
  const extras = [...onList.entries()]
    .filter(([tile, { item }]) => !productById(tile) && !mineKeys.has(tile) && (!needle || normalize(item.name).includes(needle)))
    .map(([, entry]) => entry);
  /** Search results with the closest catalog product first, also when only a typo or the plural matched. */
  const known = useMemo(() => (needle ? suggestion(query, mine) : null), [needle, query, mine]);
  const close = known?.kind === "catalog" ? known.product : null;
  const results = close ? [close, ...visible.filter((product) => product.id !== close.id)] : visible;
  const nothing = visible.length === 0 && extras.length === 0 && mineVisible.length === 0;
  const custom = needle && nothing && (!known || (known.kind === "catalog" && known.close)) ? customName(query) : null;

  useEffect(() => {
    if (needle) return;
    let frame = 0;
    const follow = () => {
      frame = 0;
      if (jumping.current) return;
      const head = headRef.current?.offsetHeight ?? 0;
      const line = head + (window.innerHeight - head) * SPY_SHARE;
      const tops = CATEGORIES.map((entry) => sectionRefs.current[entry.id]?.getBoundingClientRect().top ?? Infinity);
      const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const index = activeSection(tops, line, atBottom);
      if (index >= 0) setActive(CATEGORIES[index].id);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(follow);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    follow();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [needle]);

  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-category="${active}"]`);
    if (!strip || !tab) return;
    strip.scrollTo({ left: tab.offsetLeft - strip.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);

  useEffect(() => {
    if (needle || !pendingJump.current) return;
    scrollToSection(pendingJump.current);
    pendingJump.current = null;
  });

  useEffect(() => () => jumping.current?.(), []);

  function scrollToSection(id: CategoryId) {
    const section = sectionRefs.current[id];
    if (!section) return;
    setActive(id);
    jumping.current?.();
    const top = id === CATEGORIES[0].id ? 0 : section.getBoundingClientRect().top + window.scrollY - (headRef.current?.offsetHeight ?? 0);
    const timer = window.setTimeout(() => release(), JUMP_MS);
    const release = () => {
      window.clearTimeout(timer);
      window.removeEventListener("scrollend", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("wheel", release);
      jumping.current = null;
    };
    jumping.current = release;
    window.addEventListener("scrollend", release);
    window.addEventListener("touchstart", release, { passive: true });
    window.addEventListener("wheel", release, { passive: true });
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  }

  function jumpTo(id: CategoryId) {
    if (needle) {
      setActive(id);
      pendingJump.current = id;
      setQuery("");
      return;
    }
    scrollToSection(id);
  }

  function addMore(item: AdventureItem) {
    dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity + 1 });
    setBurst((current) => ({ id: item.productId, token: (current?.token ?? 0) + 1 }));
    playPop();
    buzz(8);
  }

  function takeOff(tile: string) {
    if (!adventure || adventure.phase === "done") return [];
    const removed = adventure.items.flatMap((item, index) => (tileOf(item) === tile && item.status !== "found" ? [{ item, index }] : []));
    for (const { item } of removed) dispatch({ type: "remove-item", itemId: item.id });
    return removed;
  }

  function removeProduct(tile: string) {
    const removed = takeOff(tile);
    if (!removed.length) return;
    show(`${removed[0].item.name} verwijderd`, {
      label: "Ongedaan maken",
      run: () => removed.forEach(({ item, index }) => dispatch({ type: "insert-item", item, index })),
    });
  }

  function forgetMine(entry: SavedItem) {
    const key = mineKey(entry);
    const index = mine.findIndex((saved) => mineKey(saved) === key);
    const removed = takeOff(key);
    dispatch({ type: "forget-mine", key });
    buzz(12);
    show(`${entry.name} vergeten`, {
      label: "Ongedaan maken",
      run: () => {
        dispatch({ type: "restore-mine", entry, index });
        removed.forEach(({ item, index: at }) => dispatch({ type: "insert-item", item, index: at }));
      },
    });
  }

  function addMine(entry: SavedItem) {
    const key = mineKey(entry);
    dispatch({ type: "add-mine", key });
    setBurst((current) => ({ id: key, token: (current?.token ?? 0) + 1 }));
    playPop();
    buzz(8);
  }

  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), BURST_MS + 20);
    return () => window.clearTimeout(timer);
  }, [burst]);

  function addProduct(product: Product) {
    dispatch({ type: "add-product", product });
    setBurst((current) => ({ id: product.id, token: (current?.token ?? 0) + 1 }));
    playPop();
    buzz(8);
  }

  /** What the sheet already found goes straight onto the new item, so the background tidy-up has nothing left to ask. */
  function confirmCustom(name: string, { tidy, answer }: NewProductChoice, after: "more" | "list") {
    const productId = customProductId(name);
    addCustom(name);
    const branded = answer?.classification === "branded" && answer.brand ? answer : null;
    if (branded) dispatch({ type: "brand-custom", productId, brand: branded.brand!, category: branded.category });
    else if (tidy.status === "brand") dispatch({ type: "brand-custom", productId, brand: tidy.brand });
    else if (tidy.status === "ok") dispatch({ type: "enrich-custom", productId, result: tidy.enrichment, illustrations: tidy.illustrations });
    setNewName(null);
    setQuery("");
    if (after === "list") navigate("/controleren");
    else searchRef.current?.focus();
  }

  function addCustom(name: string) {
    const productId = customProductId(name);
    const key = mineKey({ name, kind: "custom_generic", productId });
    const remembered = mine.some((entry) => mineKey(entry) === key);
    const existing = adventure?.phase === "done" ? undefined : adventure?.items.find((item) => item.productId === productId && item.status !== "found");
    const itemId = crypto.randomUUID();
    dispatch({ type: "add-custom", name, itemId });
    setBurst((current) => ({ id: key, token: (current?.token ?? 0) + 1 }));
    playPop();
    buzz(8);
    show(`${name} toegevoegd!`, {
      label: "Ongedaan maken",
      run: () => {
        if (existing) dispatch({ type: "set-quantity", itemId: existing.id, quantity: existing.quantity });
        else dispatch({ type: "remove-item", itemId });
        if (!remembered) dispatch({ type: "forget-mine", key });
      },
    });
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

  const mineTile = (entry: SavedItem) => {
    const key = mineKey(entry);
    const listed = onList.get(key);
    return (
      <GridTile
        key={key}
        name={entry.name}
        category={entry.category}
        art={<ItemArt item={listed ? listed.item : entry} />}
        quantity={listed?.quantity ?? 0}
        pop={burst?.id === key ? burst : null}
        onAdd={() => addMine(entry)}
        onRemove={() => forgetMine(entry)}
        mine
        offer={offerOn(listed?.item)}
      />
    );
  };

  const extraTile = (entry: OnList) => (
    <GridTile
      key={entry.item.id}
      name={entry.item.name}
      category={entry.item.category}
      art={<ItemArt item={entry.item} />}
      quantity={entry.quantity}
      pop={burst?.id === entry.item.productId ? burst : null}
      onAdd={() => addMore(entry.item)}
      onRemove={() => removeProduct(tileOf(entry.item))}
      offer={offerOn(entry.item)}
    />
  );

  const productTile = (product: Product) => {
    const entry = onList.get(product.id);
    return (
      <GridTile
        key={product.id}
        name={product.name}
        category={product.category}
        art={<ItemArt item={entry ? entry.item : { icon: product.id, name: product.name }} />}
        quantity={entry?.quantity ?? 0}
        pop={burst?.id === product.id ? burst : null}
        onAdd={() => addProduct(product)}
        onRemove={() => removeProduct(product.id)}
        offer={offerOn(entry?.item)}
      />
    );
  };

  return (
    <main className="screen screen-add">
      <div className="add-head" ref={headRef}>
        <TopBar
          title="Wat nemen we mee?"
          action={
            <button
              type="button"
              className={retailer ? "store-chip is-set" : "store-chip"}
              data-testid="store-chip"
              aria-label={retailer ? `Supermarkt: ${retailerName(retailer)}. Wijzigen` : "Kies een supermarkt voor aanbiedingen"}
              onClick={() => setPickingStore(true)}
            >
              <TagIcon />
              <span>{retailer ? RETAILERS.find((entry) => entry.id === retailer)?.short : "Winkel"}</span>
            </button>
          }
        />
        <div className="search-row">
          <label className="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Zoek een product</span>
            <input
              ref={searchRef}
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
        <nav className="tabs" ref={tabsRef} aria-label="Categorieën">
          {CATEGORIES.map((tab) => {
            const current = !needle && active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-category={tab.id}
                aria-current={current ? "true" : undefined}
                className={current ? "tab is-active" : "tab"}
                onClick={() => jumpTo(tab.id)}
              >
                {current && <motion.span layoutId="tab-pill" className="tab-pill" transition={spring} />}
                <span className="tab-label">{tab.short}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Temporarily hidden: {!needle && <DiscoverBanner count={discovered} onStart={() => photo.current?.discover()} />} */}

      {needle ? (
        <div className="product-grid">
          {mineVisible.map(mineTile)}
          {extras.map(extraTile)}
          {results.map(productTile)}
          {custom && (
            <motion.button
              type="button"
              className="product-card add-custom"
              data-testid="add-custom"
              whileTap={{ scale: 0.94 }}
              transition={{ duration: 0.09 }}
              onClick={() => {
                setNewName(custom);
                setShown((current) => ({ name: custom, token: (current?.token ?? 0) + 1 }));
              }}
            >
              <span className="card-art add-custom-art" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
              <span className="card-name">Voeg “{query.trim()}” toe</span>
            </motion.button>
          )}
        </div>
      ) : (
        CATEGORIES.map((section) => (
          <section
            key={section.id}
            ref={(node) => {
              sectionRefs.current[section.id] = node;
            }}
            className="product-section"
            aria-labelledby={`section-${section.id}`}
            data-testid="product-section"
          >
            <h2 id={`section-${section.id}`}>{section.label}</h2>
            <div className="product-grid">
              {mineVisible.filter((entry) => entry.category === section.id).map(mineTile)}
              {extras.filter((entry) => entry.item.category === section.id).map(extraTile)}
              {visible.filter((product) => product.category === section.id).map(productTile)}
            </div>
          </section>
        ))
      )}
      {deals > 0 && <Attribution className="add-attribution" />}
      {nothing && !close && !custom && <p className="empty">Niets gevonden. Typ één product, zoals cashewnoten.</p>}
      {custom && <p className="add-hint">Staat het er niet bij? Voeg het toe, ook een merk zoals Chocomel. Karrie zoekt er meteen een foto of plaatje bij.</p>}
      {count > 0 && <p className="add-hint">Lang drukken haalt een product van de lijst.</p>}
      {mineVisible.length > 0 && <p className="add-hint">Producten met een hartje onthoudt Karrie van eerder. Lang drukken vergeet ze.</p>}

      <div className="dock dock-fixed">
        <PressButton variant="quiet" data-testid="paste" onClick={() => setPasteOpen(true)}>
          Lijst plakken
        </PressButton>
        <PressButton variant="primary" data-testid="to-list" disabled={count === 0} onClick={() => navigate("/controleren")}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="dock-icon">
            <rect x="5" y="3.5" width="14" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          Lijstje
          {count > 0 && (
            <motion.span key={count} className="dock-count" initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={spring}>
              {count}
            </motion.span>
          )}
        </PressButton>
      </div>

      <Sheet open={newName !== null} onClose={() => setNewName(null)} label="Nieuw product">
        {shown && <NewProductSheet key={shown.token} name={shown.name} onAdd={(choice, after) => confirmCustom(shown.name, choice, after)} onCancel={() => setNewName(null)} />}
      </Sheet>

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

      <Sheet open={pickingStore} onClose={() => setPickingStore(false)} label="Supermarkt kiezen">
        <h2>Bij welke supermarkt?</h2>
        <p className="sheet-note">Dan laat Karrie zien wat er op je lijstje in de aanbieding is.</p>
        <RetailerPicker
          value={retailer}
          onChange={(next) => {
            dispatch({ type: "set-retailer", retailer: next });
            setPickingStore(false);
          }}
        />
        <Attribution />
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
