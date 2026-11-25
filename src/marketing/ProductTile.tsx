import { ProductArt } from "../components/ProductArt";

export function ProductTile({ id, name }: { id: string; name: string }) {
  return (
    <li className="mkt-product-tile">
      <span className="mkt-product-art" aria-hidden="true">
        <ProductArt id={id} />
      </span>
      <span className="mkt-product-name">{name}</span>
    </li>
  );
}
