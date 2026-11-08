import { useEffect, useRef, useState } from "react";
import { decodePhoto, releasePhoto } from "../features/photo/imageProcessing";
import { customProducts } from "../services/customProducts/client";
import { savePhoto } from "../storage/photos";
import type { LookupStatus } from "../storage/lookupStore";
import { nameImages, useNameImagesVersion } from "../storage/nameImages";
import type { NameAnswer } from "../services/images/nameImage";
import { nameImageKey, wantsNameImage } from "../domain/imageIdentity";
import { parseName } from "../domain/typedName";
import type { AdventureItem, CategoryId, SavedItem } from "../domain/types";
import type { Action, AppState } from "./reducer";

type Work = { productId: string; name: string };
type BrandWork = { productId: string; brand: string; category?: CategoryId };

export type CustomWork = { lookup: string[]; normalize: Work[]; illustrate: Work[]; brand: BrandWork[] };

const nothing = { status: () => "none" as LookupStatus, value: () => null };

/**
 * Typed-in products that still wait for something, once per product. A new product is looked up by name first:
 * a brand found there needs no OpenAI tidy-up and no drawing; anything else goes through the tidy-up as before.
 * While the name lookup has not answered (also offline), the tidy-up waits.
 */
export function customWork(
  state: Pick<AppState, "mine" | "adventure">,
  names: { status: (key: string) => LookupStatus; value: (key: string) => NameAnswer | null } = nothing,
): CustomWork {
  const lookup = new Set<string>();
  const normalize = new Map<string, Work>();
  const illustrate = new Map<string, Work>();
  const brand = new Map<string, BrandWork>();
  const visit = (item: SavedItem | AdventureItem, onList: boolean) => {
    if (item.kind !== "custom_generic") return;
    const key = wantsNameImage(item) ? nameImageKey(item.name) : null;
    const pending = item.enrichment?.status === "pending";
    if (key && (pending || onList)) lookup.add(key);
    const answer = key && names.status(key) !== "pending" ? names.value(key) : null;
    const branded = answer?.classification === "branded" && answer.brand ? answer : null;
    if (branded && (pending || (item.enrichment?.status === "failed" && !item.brand))) {
      brand.set(item.productId, { productId: item.productId, brand: branded.brand!, ...(branded.category && { category: branded.category }) });
      return;
    }
    if (pending) {
      if (!key || names.status(key) !== "pending") normalize.set(item.productId, { productId: item.productId, name: item.name });
    } else if (item.illustration === "pending" && !item.illustrationId && !item.brand) illustrate.set(item.productId, { productId: item.productId, name: item.name });
  };
  state.mine.forEach((item) => visit(item, false));
  state.adventure?.items.forEach((item) => visit(item, true));
  for (const id of [...normalize.keys(), ...brand.keys()]) illustrate.delete(id);
  for (const id of brand.keys()) normalize.delete(id);
  return { lookup: [...lookup], normalize: [...normalize.values()], illustrate: [...illustrate.values()], brand: [...brand.values()] };
}

const DRAWING_SIDE = 256;

/** A small copy for the device; the canvas keeps transparency and drops anything but pixels. */
async function shrink(image: Blob): Promise<Blob> {
  const decoded = await decodePhoto(image);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = DRAWING_SIDE;
    canvas.height = DRAWING_SIDE;
    const context = canvas.getContext("2d");
    if (!context) return image;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded, 0, 0, DRAWING_SIDE, DRAWING_SIDE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    canvas.width = 0;
    canvas.height = 0;
    return blob ?? image;
  } finally {
    releasePhoto(decoded);
  }
}

/**
 * Tidies typed-in products in the background: one try per product per app session (the reducer stops after a few
 * failed tries in total), and again when the device comes back online. A drawing only when the server offers one.
 */
export function useCustomEnrichment(state: AppState, dispatch: (action: Action) => void, ready: boolean) {
  const tried = useRef(new Set<string>());
  const [online, setOnline] = useState(0);

  useEffect(() => {
    const again = () => setOnline((count) => count + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, []);

  useNameImagesVersion();
  const { lookup, normalize, illustrate, brand }: CustomWork = ready ? customWork(state, nameImages) : { lookup: [], normalize: [], illustrate: [], brand: [] };
  const lookupKey = lookup.join("\n");
  const brandKey = brand.map((work) => `${work.productId}=${work.brand}`).join(",");
  const key = [...normalize.map((work) => `n:${work.productId}`), ...illustrate.map((work) => `i:${work.productId}`)].join(",");

  useEffect(() => {
    for (const name of lookup) nameImages.request(name);
  }, [lookupKey]);

  useEffect(() => {
    for (const work of brand) dispatch({ type: "brand-custom", ...work });
  }, [brandKey, dispatch]);

  useEffect(() => {
    if (!key) return;
    for (const work of normalize) {
      const id = `n:${work.productId}`;
      if (tried.current.has(id)) continue;
      tried.current.add(id);
      void customProducts.normalize(work.name).then((outcome) => {
        if (outcome.status === "ok") {
          dispatch({ type: "enrich-custom", productId: work.productId, result: outcome.enrichment, illustrations: outcome.illustrations });
        } else if (outcome.status === "refused" && outcome.brand) {
          dispatch({ type: "brand-custom", productId: work.productId, brand: parseName(work.name)?.base ?? work.name });
        } else if (outcome.status === "refused") {
          dispatch({ type: "enrich-custom", productId: work.productId, result: null, final: true });
        } else if (customProducts.online()) {
          dispatch({ type: "enrich-custom", productId: work.productId, result: null });
        } else {
          tried.current.delete(id);
        }
      });
    }
    for (const work of illustrate) {
      const id = `i:${work.productId}`;
      if (tried.current.has(id)) continue;
      tried.current.add(id);
      void customProducts
        .illustration(work.name)
        .then(async (outcome) => {
          if (outcome.status === "none") return dispatch({ type: "set-illustration", productId: work.productId, illustrationId: null });
          if (outcome.status === "retry") {
            if (!customProducts.online()) tried.current.delete(id);
            return;
          }
          const illustrationId = await savePhoto(await shrink(outcome.image));
          dispatch({ type: "set-illustration", productId: work.productId, illustrationId });
        })
        .catch(() => undefined);
    }
  }, [key, online, dispatch]);
}
