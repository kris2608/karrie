import { useEffect, useRef, useState } from "react";
import { decodePhoto, releasePhoto } from "../features/photo/imageProcessing";
import { customProducts } from "../services/customProducts/client";
import { savePhoto } from "../storage/photos";
import type { AdventureItem, SavedItem } from "../domain/types";
import type { Action, AppState } from "./reducer";

type Work = { productId: string; name: string };

/** Typed-in products that still wait for their tidy-up or their drawing, once per product. */
export function customWork(state: Pick<AppState, "mine" | "adventure">): { normalize: Work[]; illustrate: Work[] } {
  const normalize = new Map<string, Work>();
  const illustrate = new Map<string, Work>();
  const visit = (item: SavedItem | AdventureItem) => {
    if (item.kind !== "custom_generic") return;
    if (item.enrichment?.status === "pending") normalize.set(item.productId, { productId: item.productId, name: item.name });
    else if (item.illustration === "pending" && !item.illustrationId) illustrate.set(item.productId, { productId: item.productId, name: item.name });
  };
  state.mine.forEach(visit);
  state.adventure?.items.forEach(visit);
  for (const id of normalize.keys()) illustrate.delete(id);
  return { normalize: [...normalize.values()], illustrate: [...illustrate.values()] };
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

  const { normalize, illustrate } = ready ? customWork(state) : { normalize: [], illustrate: [] };
  const key = [...normalize.map((work) => `n:${work.productId}`), ...illustrate.map((work) => `i:${work.productId}`)].join(",");

  useEffect(() => {
    if (!key) return;
    for (const work of normalize) {
      const id = `n:${work.productId}`;
      if (tried.current.has(id)) continue;
      tried.current.add(id);
      void customProducts.normalize(work.name).then((outcome) => {
        if (outcome.status === "ok") {
          dispatch({ type: "enrich-custom", productId: work.productId, result: outcome.enrichment, illustrations: outcome.illustrations });
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
