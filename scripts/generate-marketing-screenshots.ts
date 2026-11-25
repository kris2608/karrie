import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductArt } from "../src/components/ProductArt";
import { Karrie } from "../src/components/mascot/Karrie";
import { StickerBadge } from "../src/components/StickerBadge";
import { StarIcon } from "../src/components/ui/StarIcon";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "images", "marketing");
fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error("Chrome of Edge niet gevonden; zet CHROME_PATH.");
  return found;
}

const chrome = findChrome();
const work = fs.mkdtempSync(path.join(os.tmpdir(), "karrie-mkt-"));

const css = `
  *{box-sizing:border-box}
  html,body{margin:0;background:#fff6e8;font-family:Nunito,Trebuchet MS,Segoe UI,sans-serif;color:#2b3640}
  .scene{width:720px;height:480px;padding:28px 32px;display:flex;flex-direction:column;gap:16px;
    background:linear-gradient(160deg,#d4f4f0 0%,#fff6e8 45%,#fff1bf 100%)}
  .title{font-weight:900;font-size:28px;margin:0}
  .row{display:flex;gap:16px;align-items:center;flex:1}
  .tile{width:120px;height:140px;background:#fffdf9;border-radius:24px;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:8px;box-shadow:0 10px 24px -8px rgba(120,72,20,.22)}
  .tile svg{width:88px;height:88px}
  .label{font-weight:900;font-size:16px}
  .check{width:28px;height:28px;color:#3cc46b}
  .found{display:inline-flex;align-items:center;justify-content:center;min-height:56px;padding:12px 28px;
    border-radius:999px;background:linear-gradient(180deg,#ff8a1f,#e56a0a);color:#fff;font-weight:900;font-size:22px;
    box-shadow:0 10px 24px -8px rgba(120,72,20,.3)}
  .mascot{width:200px}
  .mascot svg{width:100%;height:auto}
  .rewards{display:flex;gap:20px;align-items:center}
  .star{width:72px;height:72px;color:#ffd23f}
  .sticker{width:88px;height:88px}
`;

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}

const listItems = [
  { id: "banaan", name: "Banaan" },
  { id: "appel", name: "Appel" },
  { id: "melk", name: "Melk" },
];

const listHtml = page(`
  <div class="scene">
    <p class="title">Ons lijstje</p>
    <div class="row">
      ${listItems
        .map(
          (item) => `
        <div class="tile">
          ${renderToStaticMarkup(createElement(ProductArt, { id: item.id }))}
          <span class="label">${item.name}</span>
          <svg class="check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>`,
        )
        .join("")}
    </div>
  </div>
`);

const shopHtml = page(`
  <div class="scene">
    <p class="title">Op speurtocht</p>
    <div class="row" style="justify-content:space-around">
      <div class="mascot">${renderToStaticMarkup(createElement(Karrie, { mood: "idle" }))}</div>
      <div style="display:flex;flex-direction:column;gap:18px;align-items:center">
        <div class="tile">
          ${renderToStaticMarkup(createElement(ProductArt, { id: "banaan" }))}
          <span class="label">Banaan</span>
        </div>
        <span class="found">Gevonden!</span>
      </div>
    </div>
  </div>
`);

const stickersHtml = page(`
  <div class="scene">
    <p class="title">Sterren &amp; stickers</p>
    <div class="row rewards" style="justify-content:center">
      <span class="star">${renderToStaticMarkup(createElement(StarIcon, { className: "star" }))}</span>
      <span class="sticker">${renderToStaticMarkup(createElement(StickerBadge, { id: "appel" }))}</span>
      <span class="sticker">${renderToStaticMarkup(createElement(StickerBadge, { id: "kar" }))}</span>
    </div>
  </div>
`);

function renderPng(html: string, file: string) {
  const pagePath = path.join(work, `${file}.html`);
  fs.writeFileSync(pagePath, html);
  const out = path.join(outDir, file);
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--user-data-dir=${path.join(work, "profile-" + file)}`,
    "--window-size=720,480",
    `--screenshot=${out}`,
    pathToFileURL(pagePath).href,
  ]);
  console.log(`Wrote ${out}`);
}

renderPng(listHtml, "lijstje.png");
renderPng(shopHtml, "winkel.png");
renderPng(stickersHtml, "stickers.png");
fs.rmSync(work, { recursive: true, force: true });
console.log("Marketing screenshots ready.");
