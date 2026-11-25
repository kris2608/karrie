import type { ReactNode } from "react";
import { Karrie } from "../components/mascot/Karrie";
import { FEEDBACK_FORM } from "../domain/feedback";
import { PUBLIC_PATHS } from "../content/marketing/site";

type PublicLayoutProps = {
  children: ReactNode;
  current?: string;
  ctaHref?: string;
  ctaLabel?: string;
};

export function PublicLayout({
  children,
  current,
  ctaHref = PUBLIC_PATHS.home,
  ctaLabel = "Open Karrie",
}: PublicLayoutProps) {
  return (
    <div className="mkt">
      <a className="mkt-skip" href="#inhoud">
        Ga naar inhoud
      </a>
      <header className="mkt-header">
        <div className="mkt-header-inner">
          <a className="mkt-brand" href={PUBLIC_PATHS.home} aria-label="Karrie – naar de app">
            <span className="mkt-brand-mark" aria-hidden="true">
              <Karrie mood="greeting" className="mkt-mascot-svg" />
            </span>
            <span className="mkt-brand-name">Karrie</span>
          </a>
          <nav className="mkt-nav" aria-label="Hoofd">
            <a
              href={PUBLIC_PATHS.over}
              className="mkt-nav-link"
              aria-current={current === PUBLIC_PATHS.over ? "page" : undefined}
            >
              Over Karrie
            </a>
            <a className="mkt-btn mkt-btn-primary mkt-btn-header" href={ctaHref} data-mkt-cta="header">
              {ctaLabel}
            </a>
          </nav>
        </div>
      </header>
      <main id="inhoud" className="mkt-main">
        {children}
      </main>
      <footer className="mkt-footer">
        <div className="mkt-footer-inner">
          <p className="mkt-footer-brand">Karrie</p>
          <nav className="mkt-footer-nav" aria-label="Voet">
            <a href={PUBLIC_PATHS.over}>Over Karrie</a>
            <a href={PUBLIC_PATHS.ontdek}>Ontdek Karrie</a>
            <a href={PUBLIC_PATHS.tips}>Tips voor ouders</a>
            <a href={PUBLIC_PATHS.visualList}>Lijstje met plaatjes</a>
            <a href={PUBLIC_PATHS.privacy}>Privacy</a>
            <a href={`${FEEDBACK_FORM}?source=marketing`} target="_blank" rel="noopener noreferrer">
              Feedback
            </a>
          </nav>
          <p className="mkt-footer-note">Gratis boodschappenspel in de browser. Geen account nodig.</p>
        </div>
      </footer>
    </div>
  );
}

export function CtaBlock({
  lead,
  label,
  href = PUBLIC_PATHS.home,
  trust,
}: {
  lead?: string;
  label: string;
  href?: string;
  trust?: string;
}) {
  return (
    <div className="mkt-cta-block">
      {lead ? <p className="mkt-cta-lead">{lead}</p> : null}
      <a className="mkt-btn mkt-btn-primary mkt-btn-lg" href={href} data-mkt-cta="section">
        {label}
      </a>
      {trust ? <p className="mkt-trust">{trust}</p> : null}
    </div>
  );
}
