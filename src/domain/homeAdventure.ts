import { mineKey } from "./mine";
import type { ProductDraft } from "./productDraft";
import type { Adventure, AdventureItem } from "./types";

/**
 * What the child sees after the camera found something.
 * collect: sure enough to put in the basket straight away; ask: a likely catalog product to confirm;
 * duplicate: already on the list; parent: unknown or doubtful, a grown-up has a look.
 */
export type Verdict = { kind: "collect" } | { kind: "ask" } | { kind: "parent" } | { kind: "duplicate"; item: AdventureItem };

/** Celebrated once per list each, never again after a rerender, a reopen or a dip in the count. */
export const MILESTONES = [5];

/** An open item that is the same product: the same catalog drawing, barcode or remembered product. */
export function sameProduct(draft: ProductDraft, items: readonly AdventureItem[]): AdventureItem | undefined {
  const open = items.filter((item) => item.status !== "found");
  const own = draft.from.mine ? mineKey(draft.from.mine) : null;
  return open.find(
    (item) =>
      (draft.ean && item.ean === draft.ean) ||
      (own && mineKey(item) === own) ||
      (draft.match && !draft.keepPhoto && !item.ean && item.productId === draft.match.id),
  );
}

/** confirmed: the child said yes to "Is dit een …?", which settles an unsure catalog match. */
export function discoveryVerdict(draft: ProductDraft | null, items: readonly AdventureItem[], confirmed = false): Verdict {
  if (!draft || !draft.recognized || !draft.name.trim()) return { kind: "parent" };
  // Ambiguous multi-candidate photos need an explicit parent choice before anything is collected.
  if (draft.needsSelection && (draft.identityCandidates?.length ?? 0) > 1) return { kind: "parent" };
  const sure = !draft.unsure || confirmed;
  const twin = sameProduct(draft, items);
  if (twin && (sure || (draft.ean && twin.ean === draft.ean))) return { kind: "duplicate", item: twin };
  if (sure && (draft.confident || confirmed)) return { kind: "collect" };
  // Only a loose product with its own drawing is asked; a doubtful brand or web page goes to a parent.
  if (draft.match && !draft.keepPhoto) return { kind: "ask" };
  return { kind: "parent" };
}

/** The name the child sees: the drawing's own name for loose products, else the product name. */
export function childName(draft: ProductDraft): string {
  return draft.match && !draft.keepPhoto ? draft.match.name : draft.name;
}

/** Distinct products collected at home that are still on the list. */
export function discoveredCount(adventure: Pick<Adventure, "items" | "discovered"> | null | undefined): number {
  if (!adventure?.discovered?.length) return 0;
  const ids = new Set(adventure.items.map((item) => item.id));
  return adventure.discovered.filter((id) => ids.has(id)).length;
}

export function milestoneReached(count: number, cheered: readonly number[] | undefined): number | null {
  return MILESTONES.find((milestone) => count >= milestone && !cheered?.includes(milestone)) ?? null;
}

export function collectedLine(count: number): string {
  return count === 1 ? "1 product ontdekt!" : `${count} producten verzameld!`;
}

export type GateRead = "new" | "again" | "held";

/**
 * Decides per confirmed barcode whether it beeps and is looked up. "again": the same code as before, no new beep;
 * "held": the pack just collected is still in view after "Zoek de volgende!", so it is ignored for a moment.
 */
export function createScanGate(holdMs = 3000) {
  let last: string | null = null;
  let held: { ean: string; until: number } | null = null;
  return {
    read(ean: string, now: number): GateRead {
      if (held && held.ean === ean && now < held.until) return "held";
      if (last === ean) return "again";
      last = ean;
      return "new";
    },
    hold(ean: string, now: number) {
      held = { ean, until: now + holdMs };
      last = null;
    },
    reset() {
      last = null;
      held = null;
    },
  };
}
