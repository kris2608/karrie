import { PUBLIC_PATHS } from "../../content/marketing/site";
import { VISUAL_LIST, VISUAL_LIST_ITEMS } from "../../content/marketing/visualList";
import { CtaBlock, PublicLayout } from "../layout";
import { ProductTile } from "../ProductTile";

export function VisualListPage() {
  return (
    <PublicLayout current={PUBLIC_PATHS.visualList} ctaLabel={VISUAL_LIST.cta}>
      <article className="mkt-article">
        <h1>{VISUAL_LIST.h1}</h1>
        <p className="mkt-lead">{VISUAL_LIST.intro}</p>
        <h2>{VISUAL_LIST.exampleLead}</h2>
        <ul className="mkt-product-grid">
          {VISUAL_LIST_ITEMS.map((item) => (
            <ProductTile key={item.id} id={item.id} name={item.name} />
          ))}
        </ul>
        <p className="mkt-note">{VISUAL_LIST.note}</p>
        <p>
          Meer over het spel? Lees <a href={PUBLIC_PATHS.ontdek}>Ontdek Karrie</a> of{" "}
          <a href={PUBLIC_PATHS.tips}>tips voor boodschappen met kinderen</a>.
        </p>
      </article>
      <CtaBlock label={VISUAL_LIST.cta} trust="Opent Karrie. Jouw bestaande lijstjes blijven staan." />
    </PublicLayout>
  );
}
