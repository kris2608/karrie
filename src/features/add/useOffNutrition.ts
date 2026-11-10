import { useEffect, useState } from "react";
import { nutritionOf } from "../../domain/productDraft";
import type { Nutrition } from "../../domain/types";
import { lookupBarcode } from "../../services/barcode/lookup";

/**
 * When a preview has an EAN but no stored Nutri-Score, fill nutrition from the barcode/OFF cache
 * (and a background lookup). Never invents a grade.
 */
export function useOffNutrition(ean: string | undefined, existing?: Nutrition): Nutrition | undefined {
  const [fetched, setFetched] = useState<Nutrition | undefined>();
  const need = Boolean(ean && !existing?.nutriscore);

  useEffect(() => {
    if (!need || !ean) {
      setFetched(undefined);
      return;
    }
    let cancelled = false;
    void lookupBarcode(ean, []).then((outcome) => {
      if (cancelled || outcome.status !== "found") return;
      const nutrition = nutritionOf(outcome.answer);
      if (nutrition?.nutriscore) setFetched(nutrition);
    });
    return () => {
      cancelled = true;
    };
  }, [ean, need]);

  if (existing?.nutriscore) return existing;
  return fetched ?? existing;
}
