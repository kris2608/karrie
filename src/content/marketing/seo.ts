import { ABOUT_PUBLIC } from "./about";
import { ONTDEK } from "./ontdek";
import { absoluteUrl, CANONICAL_ORIGIN, OG_IMAGE, PUBLIC_PATHS } from "./site";
import { TIPS } from "./tips";
import { VISUAL_LIST } from "./visualList";

export type PageSeo = {
  path: string;
  title: string;
  description: string;
  ogType?: "website" | "article";
};

export const HOME_SEO = {
  title: "Karrie – Boodschappenspel voor peuters en kleuters",
  description:
    "Maak boodschappen doen met kinderen een avontuur. Laat je kind zelf producten zoeken, scannen en stickers verzamelen. Gratis, zonder account.",
  canonical: absoluteUrl(PUBLIC_PATHS.home),
} as const;

export const PAGE_SEO: Record<string, PageSeo> = {
  ontdek: {
    path: PUBLIC_PATHS.ontdek,
    title: ONTDEK.title,
    description: ONTDEK.description,
  },
  over: {
    path: PUBLIC_PATHS.over,
    title: ABOUT_PUBLIC.title,
    description: ABOUT_PUBLIC.description,
  },
  tips: {
    path: PUBLIC_PATHS.tips,
    title: TIPS.title,
    description: TIPS.description,
    ogType: "article",
  },
  visualList: {
    path: PUBLIC_PATHS.visualList,
    title: VISUAL_LIST.title,
    description: VISUAL_LIST.description,
    ogType: "article",
  },
};

export function softwareApplicationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Karrie",
    url: CANONICAL_ORIGIN,
    description: HOME_SEO.description,
    applicationCategory: "GameApplication",
    operatingSystem: "Web browser",
    inLanguage: "nl",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
    },
    image: OG_IMAGE,
    screenshot: absoluteUrl("/images/marketing/lijstje.png"),
  };
}

export function articleJsonLd(seo: PageSeo, headline: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description: seo.description,
    inLanguage: "nl",
    mainEntityOfPage: absoluteUrl(seo.path),
    author: { "@type": "Organization", name: "Karrie" },
    publisher: {
      "@type": "Organization",
      name: "Karrie",
      logo: { "@type": "ImageObject", url: absoluteUrl("/apple-touch-icon.png") },
    },
    image: OG_IMAGE,
  };
}
