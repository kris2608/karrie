import { ProductArt } from "../../components/ProductArt";
import { categoryIcon } from "../../domain/categoryIcon";
import { normalize } from "../../domain/matchProduct";
import type { CategoryId } from "../../domain/types";
import { products } from "../../data/catalog";

export function DrawingPicker({ name, category, icon, onPick }: { name: string; category: CategoryId; icon: string; onPick: (id: string) => void }) {
  const needle = normalize(name);
  const named = needle
    ? products.filter((product) => normalize(product.name).includes(needle) || product.aliases.some((alias) => normalize(alias).includes(needle)))
    : [];
  const pool = named.length ? named : products.filter((product) => product.category === category);
  const options = [icon, categoryIcon(category), ...pool.map((product) => product.id)]
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, 6);

  return (
    <fieldset className="scan-field">
      <legend>Kies een tekening</legend>
      <div className="scan-drawings">
        {options.map((id) => (
          <button key={id} type="button" className={id === icon ? "is-active" : undefined} aria-pressed={id === icon} aria-label={`Tekening ${id}`} onClick={() => onPick(id)}>
            <ProductArt id={id} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
