import { PUBLIC_PATHS } from "../../content/marketing/site";
import { TIPS, TIPS_FAQ } from "../../content/marketing/tips";
import { CtaBlock, PublicLayout } from "../layout";

export function TipsPage() {
  return (
    <PublicLayout current={PUBLIC_PATHS.tips}>
      <article className="mkt-article">
        <h1>{TIPS.h1}</h1>
        <p className="mkt-lead">{TIPS.intro}</p>
        {TIPS.tips.map((tip, index) => (
          <section key={tip.title} className="mkt-tip" aria-labelledby={`tip-${index}`}>
            <h2 id={`tip-${index}`}>
              {index + 1}. {tip.title}
            </h2>
            <p>{tip.body}</p>
          </section>
        ))}
        <section aria-labelledby="karrie-bridge">
          <h2 id="karrie-bridge">Hoe Karrie helpt</h2>
          <p>{TIPS.karrieBridge}</p>
          <p>
            Meer weten? Bekijk <a href={PUBLIC_PATHS.ontdek}>Ontdek Karrie</a> of{" "}
            <a href={PUBLIC_PATHS.home}>open de app</a>.
          </p>
        </section>
        <section aria-labelledby="faq">
          <h2 id="faq">Veelgestelde vragen</h2>
          <dl className="mkt-faq">
            {TIPS_FAQ.map((item) => (
              <div key={item.q} className="mkt-faq-item">
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
      <CtaBlock label="Probeer Karrie gratis" trust="Geen account. Direct in de browser." />
    </PublicLayout>
  );
}
