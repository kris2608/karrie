import { NutriScoreLogo, nutriScoreGrade, nutriScoreLogosEnabled } from "../../components/NutriScoreLogo";
import { displayFacts, type ProductFacts } from "../../domain/productFacts";
import type { AdventureItem } from "../../domain/types";
import { useFacts } from "../../storage/references";

const VALUES: { key: keyof Omit<NonNullable<ProductFacts["per100"]>, "unit">; label: string; unit: string }[] = [
  { key: "energyKcal", label: "Energie", unit: "kcal" },
  { key: "sugars", label: "Suikers", unit: "g" },
  { key: "saturatedFat", label: "Verzadigd vet", unit: "g" },
  { key: "salt", label: "Zout", unit: "g" },
  { key: "fibre", label: "Vezels", unit: "g" },
];

const amount = (value: number) => value.toLocaleString("nl-NL", { maximumFractionDigits: 2 });

/** Parent-only: shop-page facts when known, else OFF/barcode pack nutrition and ingredients. */
export function ProductInfo({ item, hideNutriScore = false }: { item: AdventureItem; hideNutriScore?: boolean }) {
  const pageFacts = useFacts(item);
  const facts = displayFacts(item, pageFacts);
  if (!facts) return null;
  const rows = VALUES.filter((row) => facts.per100?.[row.key] !== undefined);
  const grade = hideNutriScore ? null : nutriScoreGrade(facts.nutriScore);
  const logo = grade && nutriScoreLogosEnabled() ? <NutriScoreLogo grade={grade} /> : null;
  if (!rows.length && !facts.ingredients && !facts.claims && !grade) return null;

  return (
    <section className="product-info" data-testid="product-info">
      <header>
        <strong>Productinformatie</strong>
        {logo}
        {!logo && grade && (
          <span className={`nutri-score nutri-${grade.toLowerCase()}`} aria-label={`Nutri-Score ${grade}`} data-testid="nutri-score">
            Nutri-Score {grade}
          </span>
        )}
      </header>
      {rows.length > 0 && (
        <dl className="product-values">
          {rows.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd>
                {amount(facts.per100![row.key]!)} {row.unit}
              </dd>
            </div>
          ))}
          <small>per 100 {facts.per100?.unit ?? "g"}</small>
        </dl>
      )}
      {facts.claims && (
        <div className="chips">
          {facts.claims.map((claim) => (
            <span key={claim} className="chip">
              {claim}
            </span>
          ))}
        </div>
      )}
      {facts.ingredients && (
        <details>
          <summary>Ingrediënten</summary>
          <p>{facts.ingredients}</p>
          {facts.allergens && <p>Allergenen: {facts.allergens.join(", ")}</p>}
        </details>
      )}
      <small className="picture-source">
        Van {facts.sourceName}.{" "}
        <a href={facts.sourceUrl} target="_blank" rel="noreferrer noopener">
          Bron
        </a>
      </small>
    </section>
  );
}
