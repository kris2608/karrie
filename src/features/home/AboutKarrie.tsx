import type { Ref } from "react";
import { ABOUT_CLOSING, ABOUT_HEADING, ABOUT_IMAGE, ABOUT_PARAGRAPHS } from "../../content/marketing/about";

export function AboutKarrie({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <article className="about-story" data-testid="about-karrie">
      <img
        className="about-art"
        src={ABOUT_IMAGE.src}
        alt={ABOUT_IMAGE.alt}
        width={ABOUT_IMAGE.width}
        height={ABOUT_IMAGE.height}
        decoding="async"
      />
      <h2 ref={headingRef} tabIndex={-1}>
        {ABOUT_HEADING}
      </h2>
      {ABOUT_PARAGRAPHS.map((paragraph, index) =>
        index === 0 ? (
          <p key={paragraph}>
            <strong>{paragraph}</strong>
          </p>
        ) : (
          <p key={paragraph}>{paragraph}</p>
        ),
      )}
      <p className="about-pill">{ABOUT_CLOSING}</p>
    </article>
  );
}
