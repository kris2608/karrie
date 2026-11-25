import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { articleJsonLd, PAGE_SEO, softwareApplicationJsonLd, type PageSeo } from "../src/content/marketing/seo";
import { ABOUT_PUBLIC } from "../src/content/marketing/about";
import { absoluteUrl, OG_IMAGE } from "../src/content/marketing/site";
import { TIPS } from "../src/content/marketing/tips";
import { VISUAL_LIST } from "../src/content/marketing/visualList";
import { OntdekPage } from "../src/marketing/pages/OntdekPage";
import { OverPage } from "../src/marketing/pages/OverPage";
import { TipsPage } from "../src/marketing/pages/TipsPage";
import { VisualListPage } from "../src/marketing/pages/VisualListPage";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type PageDef = {
  file: string;
  entry: string;
  seo: PageSeo;
  page: ReactElement;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const pages: PageDef[] = [
  {
    file: "ontdek.html",
    entry: "/src/marketing/entries/ontdek.ts",
    seo: PAGE_SEO.ontdek,
    page: createElement(OntdekPage),
    jsonLd: softwareApplicationJsonLd(),
  },
  {
    file: "over.html",
    entry: "/src/marketing/entries/over.ts",
    seo: PAGE_SEO.over,
    page: createElement(OverPage),
  },
  {
    file: "boodschappen-met-kinderen.html",
    entry: "/src/marketing/entries/tips.ts",
    seo: PAGE_SEO.tips,
    page: createElement(TipsPage),
    jsonLd: articleJsonLd(PAGE_SEO.tips, TIPS.h1),
  },
  {
    file: "boodschappenlijstje-met-plaatjes.html",
    entry: "/src/marketing/entries/visualList.ts",
    seo: PAGE_SEO.visualList,
    page: createElement(VisualListPage),
    jsonLd: articleJsonLd(PAGE_SEO.visualList, VISUAL_LIST.h1),
  },
];

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function documentHtml(def: PageDef, body: string): string {
  const { seo, entry, jsonLd } = def;
  const canonical = absoluteUrl(seo.path);
  const ogType = seo.ogType ?? "website";
  const ld = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#14c4b8" />
    <meta name="description" content="${escapeAttr(seo.description)}" />
    <link rel="canonical" href="${escapeAttr(canonical)}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:site_name" content="Karrie" />
    <meta property="og:locale" content="nl_NL" />
    <meta property="og:url" content="${escapeAttr(canonical)}" />
    <meta property="og:title" content="${escapeAttr(seo.title)}" />
    <meta property="og:description" content="${escapeAttr(seo.description)}" />
    <meta property="og:image" content="${escapeAttr(OG_IMAGE)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Karrie, het winkelwagentje, met de tekst Speur, vind en vink af!" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>${escapeAttr(seo.title)}</title>
    ${ld}
  </head>
  <body>
    ${body}
    <script type="module" src="${entry}"></script>
  </body>
</html>
`;
}

for (const def of pages) {
  const body = renderToStaticMarkup(def.page);
  const html = documentHtml(def, body);
  const out = path.join(root, def.file);
  fs.writeFileSync(out, html);
  console.log(`Wrote ${def.file} (${ABOUT_PUBLIC.h1 && def.file === "over.html" ? "over" : def.seo.path})`);
}

console.log("Marketing pages ready.");
