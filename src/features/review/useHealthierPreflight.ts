import { useEffect, useRef } from "react";
import { resolveAssessment } from "../../domain/discovery";
import { factsFor } from "../../domain/productFacts";
import type { Adventure, AdventureItem } from "../../domain/types";
import { createHealthierClient, needsHealthierAssess } from "../../services/healthier/client";
import { references } from "../../storage/references";
import type { Action } from "../../state/reducer";

const client = createHealthierClient({
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  fetch: (...args) => fetch(...args),
  pageFacts: (item) => factsFor(item, references.entry),
});

/**
 * While the parent prepares the list, assess eligible products so bonus missions
 * are ready before shopping starts. Never runs during shopping.
 */
export function useHealthierPreflight(
  adventure: Adventure | null | undefined,
  smartDiscovery: boolean,
  dispatch: (action: Action) => void,
) {
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!adventure || adventure.phase !== "draft" || !smartDiscovery) return;
    let cancelled = false;

    const run = async () => {
      const eligible = adventure.items.filter((item) => {
        const page = factsFor(item, references.entry);
        return needsHealthierAssess(item, page) && !inFlight.current.has(item.id);
      });
      for (const item of eligible.slice(0, 5)) {
        if (cancelled) return;
        inFlight.current.add(item.id);
        try {
          await assessOne(item, dispatch);
        } finally {
          inFlight.current.delete(item.id);
        }
      }
    };

    const timer = window.setTimeout(() => void run(), 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [adventure, smartDiscovery, dispatch]);
}

async function assessOne(item: AdventureItem, dispatch: (action: Action) => void) {
  const evidence = client.evidenceFor(item);
  const result = await client.assess(evidence);
  if (result.status !== "ok") {
    if (result.code === "insufficient-data") {
      dispatch({
        type: "set-alternative",
        itemId: item.id,
        alternative: {
          status: "insufficient-data",
          evidence: "none",
          criteria: [],
          source: client.sourceFor(evidence),
          assessedAt: Date.now(),
          evidenceVersion: evidence.evidenceVersion,
        },
      });
    }
    return;
  }
  const resolved = resolveAssessment(result.alternative, item.productId, evidence.ingredients, {
    source: client.sourceFor(evidence),
    nutrition: evidence.nutrition,
    evidenceVersion: evidence.evidenceVersion,
  });
  if (!resolved) return;
  dispatch({ type: "set-alternative", itemId: item.id, alternative: resolved });
}
