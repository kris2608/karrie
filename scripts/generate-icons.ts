import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Karrie } from "../src/components/mascot/Karrie";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const markup = renderToStaticMarkup(createElement(Karrie, { mood: "greeting" }));
const cart = markup
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>$/, "")
  .replace(/ (class|style)="[^"]*"/g, "");
const withoutShadow = cart.replace(/<ellipse cx="142" cy="218"[^>]*><\/ellipse>/, "");

// Karrie spans roughly x 18–248 and y 18–220 in its 260×230 viewBox; the boxes below centre on that.
const scene = (x: number, y: number, size: number) => {
  const right = x + size;
  const bottom = y + size;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#d4f4f0"/>
<path d="M${x} 196C${x + size * 0.3} 180 ${right - size * 0.3} 184 ${right} 198V${bottom}H${x}Z" fill="#c9ecb5"/>
<path d="M${x} 226C${x + size * 0.35} 214 ${right - size * 0.3} 216 ${right} 228V${bottom}H${x}Z" fill="#a9dd92"/>`;
};

const svg = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`;

const favicon = svg("15 0 236 236", withoutShadow);
const icon = svg("-7 -20 280 280", scene(-7, -20, 280) + cart);
// Maskable icons get cropped to a circle of 80% of the width, so Karrie has to fit inside that.
const maskable = svg("-59 -72 384 384", scene(-59, -72, 384) + cart);

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
const work = fs.mkdtempSync(path.join(os.tmpdir(), "karrie-icons-"));

function renderPng(source: string, size: number, file: string) {
  const page = path.join(work, `${file}.html`);
  fs.writeFileSync(
    page,
    `<!doctype html><style>html,body{margin:0;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--user-data-dir=${path.join(work, "profile")}`,
    `--window-size=${size},${size}`,
    `--screenshot=${path.join(publicDir, file)}`,
    pathToFileURL(page).href,
  ]);
}

fs.writeFileSync(path.join(publicDir, "favicon.svg"), favicon);
renderPng(icon, 180, "apple-touch-icon.png");
renderPng(icon, 192, "pwa-192x192.png");
renderPng(icon, 512, "pwa-512x512.png");
renderPng(maskable, 512, "pwa-512x512-maskable.png");
fs.rmSync(work, { recursive: true, force: true });
console.log("Iconen bijgewerkt in public/");
