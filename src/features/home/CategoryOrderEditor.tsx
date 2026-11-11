import { categoryLabel } from "../../domain/categories";
import type { CategoryId } from "../../domain/types";
import { useAdventure } from "../../state/AdventureContext";

/** Parent control to reorder supermarket departments for walking order. */
export function CategoryOrderEditor() {
  const { categoryOrder, dispatch } = useAdventure();

  function move(id: CategoryId, direction: -1 | 1) {
    const index = categoryOrder.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categoryOrder.length) return;
    const next = categoryOrder.slice();
    [next[index], next[target]] = [next[target], next[index]];
    dispatch({ type: "set-category-order", order: next });
  }

  return (
    <div className="setting-block" data-testid="category-order">
      <span className="switch-label">
        <strong>Winkelvolgorde</strong>
        <small>Pas de volgorde van afdelingen aan voor jullie looproute</small>
      </span>
      <ul className="category-order-list" aria-label="Volgorde van afdelingen">
        {categoryOrder.map((id, index) => (
          <li key={id}>
            <span>{categoryLabel(id)}</span>
            <span className="category-order-actions">
              <button type="button" className="round-button round-s" aria-label={`${categoryLabel(id)} omhoog`} disabled={index === 0} onClick={() => move(id, -1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 14.5L12 8.5l6 6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="round-button round-s"
                aria-label={`${categoryLabel(id)} omlaag`}
                disabled={index === categoryOrder.length - 1}
                onClick={() => move(id, 1)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
