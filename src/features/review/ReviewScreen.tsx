import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { categoryLabel } from "../../domain/categories";
import { brandLabel } from "../../domain/customProduct";
import type { AdventureItem, CategoryId } from "../../domain/types";
import { ItemArt } from "../../components/ItemArt";
import { TopBar } from "../../components/TopBar";
import { PressButton } from "../../components/ui/PressButton";
import { StarIcon } from "../../components/ui/StarIcon";
import { Toast, useNotice } from "../../components/ui/Toast";
import { useLongPress } from "../../components/ui/useLongPress";
import { missionOn } from "../../domain/discovery";
import { discoveredCount } from "../../domain/homeAdventure";
import { spring } from "../../motion/variants";
import { useAdventure } from "../../state/AdventureContext";
import { listName } from "../../state/reducer";
import { summaryText } from "../../domain/offers";
import { analyticsRetailer } from "../../domain/retailers";
import { trackEvent } from "../../services/analytics";
import { offerQueries, offers, useOfferViews, type OfferView } from "../../storage/offers";
import { OfferSheet, type OpenOffer } from "../offers/OfferSheet";
import { Attribution, OfferTag, offerLabel, TagIcon } from "../offers/OfferTag";
import { RetailerPicker } from "../offers/RetailerPicker";
import { PhotoFlow, type PhotoFlowHandle } from "../photo/PhotoFlow";
import { ItemSheet } from "./ItemSheet";
import { SaveListSheet } from "./SaveListSheet";

const NO_ITEMS: AdventureItem[] = [];

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
  const [saving, setSaving] = useState(false);
  const [offerOpen, setOfferOpen] = useState<OpenOffer | null>(null);
  const photo = useRef<PhotoFlowHandle>(null);
  const { notice, show, dismiss } = useNotice();
  const items = adventure?.items ?? NO_ITEMS;
  const retailer = adventure?.phase === "draft" ? adventure.retailer : undefined;
  const { views, deals } = useOfferViews(items, retailer);

  useEffect(() => {
    if ((location.state as { editItem?: string } | null)?.editItem) navigate(".", { replace: true, state: null });
  }, [location.state, navigate]);

  const openedWith = useRef(false);
  useEffect(() => {
    if (openedWith.current || !retailer) return;
    openedWith.current = true;
    offers.sync(offerQueries(items, retailer));
  }, [items, retailer]);

  if (!adventure || adventure.phase === "done") return <Missing />;

  function openOffer(item: AdventureItem, view: OfferView) {
    const offer = view.answer.offer;
    if (!offer || !retailer) return;
    setOfferOpen({ itemName: item.name, offer, shown: view.shown });
    trackEvent({ name: "offer_opened", data: { retailer: analyticsRetailer(retailer), match_type: offer.matchType } });
  }

  const groups = adventure.categoryOrder
    .map((category) => ({
      category,
      items: adventure.items.filter((item) => item.category === category && item.status !== "found"),
    }))
    .filter((group) => group.items.length);

  const hasOpen = adventure.items.some((item) => item.status !== "found");
  const named = listName(adventure);
  const editing = adventure.items.find((item) => item.id === editId) ?? null;

  function saveForLater(name: string, store: string) {
    dispatch({ type: "save-favorite", name, store });
    navigate("/", { state: { notice: "Lijstje bewaard" } });
  }

  function start() {
    if (!adventure) return;
    const fresh = adventure.phase !== "shopping";
    if (fresh) dispatch({ type: "start-shopping" });
    navigate("/winkel", fresh && discoveredCount(adventure) > 0 ? { state: { intro: true } } : undefined);
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
      <TopBar title={named ?? "Klopt het lijstje?"} to="/toevoegen" />
      {adventure.store && (
        <p className="list-name" data-testid="list-store">
          {adventure.store}
        </p>
      )}
      {adventure.phase === "draft" && (
        <section className="offer-bar" aria-label="Aanbiedingen">
          <RetailerPicker value={adventure.retailer} onChange={(retailer) => dispatch({ type: "set-retailer", retailer })} />
          {adventure.retailer && deals > 0 && (
            <p className="offer-summary" data-testid="offer-summary">
              <TagIcon />
              <span>{summaryText(deals, adventure.retailer)}</span>
            </p>
          )}
          {adventure.retailer && views.size > 0 && <Attribution />}
        </section>
      )}
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
                  offer={views.get(item.id)}
                  onEdit={() => setEditId(item.id)}
                  onRemove={() => remove(item)}
                  onOffer={(view) => openOffer(item, view)}
                />
              ))}
            </AnimatePresence>
          </ul>
        </motion.section>
      ))}
      <div className="dock dock-fixed">
        {adventure.phase === "draft" && (
          <PressButton variant="quiet" size="l" data-testid="save-later" disabled={!hasOpen} onClick={() => setSaving(true)}>
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
        onPhoto={() => {
          if (!editing) return;
          photo.current?.open(editing);
          setEditId(null);
        }}
        onRemove={() => editing && remove(editing)}
      />
      <OfferSheet open={offerOpen} onClose={() => setOfferOpen(null)} />
      <SaveListSheet open={saving} adventure={adventure} onClose={() => setSaving(false)} onSave={saveForLater} />
      <PhotoFlow ref={photo} items={adventure.items} onDone={show} />
      <Toast notice={notice} onDismiss={dismiss} />
    </main>
  );
}

type ItemRowProps = {
  item: AdventureItem;
  first: boolean;
  last: boolean;
  offer?: OfferView;
  onEdit: () => void;
  onRemove: () => void;
  onOffer: (view: OfferView) => void;
};

function ItemRow({ item, first, last, offer, onEdit, onRemove, onOffer }: ItemRowProps) {
  const { adventure, settings, declined, dispatch } = useAdventure();
  const retailer = adventure?.retailer;
  const { pressing, handlers } = useLongPress(onRemove);
  const detail = [brandLabel(item), item.packageSize].filter(Boolean).join(" · ");
  const mission = settings.smartDiscovery && missionOn(item, declined);
  return (
    <motion.li
      layout="position"
      className={pressing ? "item-row is-pressing" : "item-row"}
      data-testid="item-row"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.16 } }}
      transition={spring}
      {...handlers}
    >
      <button type="button" className="item-art-button" aria-label={`Bewerk ${item.name}`} data-testid="edit-item" onClick={onEdit}>
        <ItemArt item={item} />
        {mission && (
          <span className="mission-badge" role="img" aria-label="Bonusmissie" data-testid="mission-badge">
            <StarIcon />
          </span>
        )}
      </button>
      <div className="item-main">
        <strong>{item.name}</strong>
        {detail && <small className="item-detail">{detail}</small>}
        {offer && retailer && (
          <button
            type="button"
            className="offer-tag-button"
            data-no-long-press
            aria-label={`${offerLabel(offer.shown, retailer)}: details`}
            data-testid="offer-button"
            onClick={() => onOffer(offer)}
          >
            <OfferTag shown={offer.shown} retailer={retailer} />
          </button>
        )}
        <div className="stepper" data-no-long-press>
          <button type="button" aria-label="Minder" disabled={item.quantity <= 1} onClick={() => dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity - 1 })}>
            −
          </button>
          <span>{item.quantity}</span>
          <button type="button" aria-label="Meer" onClick={() => dispatch({ type: "set-quantity", itemId: item.id, quantity: item.quantity + 1 })}>
            +
          </button>
        </div>
      </div>
      <div className="row-actions" data-no-long-press>
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
