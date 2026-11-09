import { RETAILERS, type RetailerId } from "../../domain/retailers";

/** One supermarket per list; tapping the chosen one again clears it, and nothing is looked up without one. */
export function RetailerPicker({ value, onChange }: { value: RetailerId | undefined; onChange: (retailer: RetailerId | null) => void }) {
  return (
    <div className="retailer-picker" role="radiogroup" aria-label="Supermarkt voor aanbiedingen">
      {RETAILERS.map((retailer) => {
        const active = value === retailer.id;
        return (
          <button
            key={retailer.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={active ? "chip retailer-chip is-active" : "chip retailer-chip"}
            data-testid={`retailer-${retailer.id}`}
            aria-label={retailer.name}
            onClick={() => onChange(active ? null : retailer.id)}
          >
            {retailer.short}
          </button>
        );
      })}
    </div>
  );
}
