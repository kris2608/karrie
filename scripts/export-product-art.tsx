/**
 * Writes every catalog drawing as an SVG file under exports/product-art/,
 * plus an index.html so you can browse them in the browser.
 *
 * Run: npx vite-node scripts/export-product-art.tsx
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ART } from "../src/components/art";
import { ProductArt } from "../src/components/ProductArt";

const out = join(process.cwd(), "exports", "product-art");
mkdirSync(out, { recursive: true });

const ids = Object.keys(ART).sort((a, b) => a.localeCompare(b, "nl"));
const cards: string[] = [];

for (const id of ids) {
  const markup = renderToStaticMarkup(createElement(ProductArt, { id }));
  const svg = markup.includes("xmlns=")
    ? markup
    : markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  writeFileSync(join(out, `${id}.svg`), svg, "utf8");
  cards.push(`<figure><img src="${id}.svg" alt="${id}" width="128" height="128" /><figcaption>${id}</figcaption></figure>`);
}

const page = `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Karrie – producttekeningen (${ids.length})</title>
    <style>
      body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #fff6e8; color: #2b3640; }
      h1 { margin: 0 0 8px; }
      p { margin: 0 0 24px; color: #5d6a74; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; }
      figure { margin: 0; padding: 16px 12px; border-radius: 20px; background: #fffdf9; box-shadow: 0 6px 18px rgba(120, 72, 20, 0.08); text-align: center; }
      img { display: block; width: 96px; height: 96px; margin: 0 auto 8px; }
      figcaption { font-weight: 700; font-size: 0.9rem; word-break: break-word; }
    </style>
  </head>
  <body>
    <h1>Producttekeningen</h1>
    <p>${ids.length} tekeningen uit de catalogus. Elk bestand staat ook als naam.svg in deze map.</p>
    <div class="grid">
${cards.join("\n")}
    </div>
  </body>
</html>
`;

writeFileSync(join(out, "index.html"), page, "utf8");
console.log(`Wrote ${ids.length} SVGs and index.html to ${out}`);
