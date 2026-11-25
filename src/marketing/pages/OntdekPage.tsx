import { Karrie } from "../../components/mascot/Karrie";
import { HOW_STEPS, ONTDEK_BENEFITS } from "../../content/marketing/howItWorks";
import { ONTDEK } from "../../content/marketing/ontdek";
import { PUBLIC_PATHS } from "../../content/marketing/site";
import { CtaBlock, PublicLayout } from "../layout";

export function OntdekPage() {
  return (
    <PublicLayout current={PUBLIC_PATHS.ontdek} ctaLabel={ONTDEK.cta}>
      <section className="mkt-hero">
        <div className="mkt-hero-copy">
          <h1>{ONTDEK.h1}</h1>
          <p className="mkt-lead">{ONTDEK.support}</p>
          <a className="mkt-btn mkt-btn-primary mkt-btn-lg" href={PUBLIC_PATHS.home} data-mkt-cta="hero">
            {ONTDEK.cta}
          </a>
          <p className="mkt-trust">{ONTDEK.trust}</p>
        </div>
        <div className="mkt-hero-art" aria-hidden="true">
          <Karrie mood="greeting" className="mkt-hero-mascot" />
        </div>
      </section>

      <section className="mkt-section" aria-labelledby="hoe-werkt">
        <h2 id="hoe-werkt">Zo werkt het</h2>
        <ol className="mkt-steps">
          {HOW_STEPS.map((step, index) => (
            <li key={step.id} className="mkt-step">
              <span className="mkt-step-num" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <img className="mkt-shot" src={step.image} alt={step.imageAlt} width={720} height={480} loading="lazy" />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mkt-section" aria-labelledby="wat-kun-je">
        <h2 id="wat-kun-je">Wat kun je met Karrie?</h2>
        <ul className="mkt-benefits">
          {ONTDEK_BENEFITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          <a href={PUBLIC_PATHS.over}>{ONTDEK.storyLinkLabel}</a>
        </p>
      </section>

      <CtaBlock lead={ONTDEK.bottomCtaLead} label={ONTDEK.cta} trust={ONTDEK.trust} />
    </PublicLayout>
  );
}
