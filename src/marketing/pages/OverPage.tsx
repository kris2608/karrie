import { ABOUT_CLOSING, ABOUT_IMAGE, ABOUT_PARAGRAPHS, ABOUT_PUBLIC } from "../../content/marketing/about";
import { PUBLIC_PATHS } from "../../content/marketing/site";
import { FEEDBACK_FORM } from "../../domain/feedback";
import { CtaBlock, PublicLayout } from "../layout";

export function OverPage() {
  return (
    <PublicLayout current={PUBLIC_PATHS.over}>
      <article className="mkt-article">
        <h1>{ABOUT_PUBLIC.h1}</h1>
        <img
          className="mkt-about-art"
          src={ABOUT_IMAGE.src}
          alt={ABOUT_IMAGE.alt}
          width={ABOUT_IMAGE.width}
          height={ABOUT_IMAGE.height}
          decoding="async"
        />
        {ABOUT_PARAGRAPHS.map((paragraph, index) =>
          index === 0 ? (
            <p key={paragraph}>
              <strong>{paragraph}</strong>
            </p>
          ) : (
            <p key={paragraph}>{paragraph}</p>
          ),
        )}
        <p className="mkt-pill">{ABOUT_CLOSING}</p>
        <h2>Waarom Karrie bestaat</h2>
        <p>{ABOUT_PUBLIC.aim}</p>
        <p>{ABOUT_PUBLIC.feedback}</p>
        <p>
          <a href={`${FEEDBACK_FORM}?source=marketing`} target="_blank" rel="noopener noreferrer">
            Geef feedback
          </a>
        </p>
      </article>
      <CtaBlock label="Probeer Karrie gratis" trust="Geen account. Geen download. Direct spelen." />
    </PublicLayout>
  );
}
