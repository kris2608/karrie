// Runs the real reference-image pipeline (dist/images.js) on Dutch supermarket products.
// Usage (from server/, after npm run build): node scripts/validate-image-search.mjs [--generic] [--like-render] [out.html]
// --like-render refuses Unsplash and Pixabay, which block Render's servers. Writes a contact sheet so the chosen
// pictures can be checked by eye. Prints no secrets.
import { existsSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { createImageDiscovery, describe } from "../dist/images.js";

if (!process.env.OPENAI_API_KEY && existsSync(".env")) process.loadEnvFile(".env");

const PRODUCTS = [
  { brand: "AH Terra", name: "Pindakaas", variant: "100% naturel", generic: false },
  { brand: "Calvé", name: "Pindakaas", size: "350 g", generic: false },
  { brand: "Almhof", name: "Griekse yoghurt", variant: "10% vet", size: "1 kg", generic: false },
  { brand: "Campina", name: "Halfvolle melk", size: "1 L", generic: false },
  { brand: "Brinta", name: "Volkoren graanontbijt", size: "500 g", generic: false },
  { brand: "Hak", name: "Bruine bonen", size: "720 g", generic: false },
  { brand: "Unox", name: "Rookworst", generic: false },
  { brand: "De Ruijter", name: "Chocoladehagel", variant: "puur", generic: false },
  { brand: "Optimel", name: "Drinkyoghurt", variant: "aardbei", generic: false },
  { brand: "Lay's", name: "Chips", variant: "paprika", generic: false },
  { brand: "Douwe Egberts", name: "Aroma Rood filterkoffie", size: "500 g", generic: false },
  { brand: "Verkade", name: "Chocoladereep", variant: "melk", generic: false },
  { brand: "Heinz", name: "Tomato ketchup", generic: false },
  { brand: "Coca-Cola", name: "Zero", size: "1,5 L", generic: false },
  { brand: "Dreft", name: "Afwasmiddel", variant: "original", generic: false },
  { name: "Banaan", generic: true },
  { name: "Appel", generic: true },
  { name: "Volkorenbrood", generic: true },
  { name: "Komkommer", generic: true },
  { name: "Eieren", generic: true },
  { name: "Tomaat", generic: true },
  { name: "Wortel", generic: true },
  { name: "Aardappelen", generic: true },
  { name: "Kaas", generic: true },
  { name: "Melk", generic: true },
];
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const wanted = flags.has("--generic") ? PRODUCTS.filter((product) => product.generic) : PRODUCTS;
const renderBlocks = /^https:\/\/([a-z0-9-]+\.)*(unsplash\.com|pixabay\.com)\//;
const web = flags.has("--like-render") ? (url, init) => (renderBlocks.test(url) ? Promise.resolve(new Response("", { status: 403 })) : fetch(url, init)) : fetch;

const PRICE = { input: 0.75, cached: 0.075, output: 4.5, searchCall: 0.01 };
const cost = (usage, searchCalls) =>
  (usage ? ((usage.inputTokens - usage.cachedInputTokens) * PRICE.input + usage.cachedInputTokens * PRICE.cached + usage.outputTokens * PRICE.output) / 1e6 : 0) + searchCalls * PRICE.searchCall;

const client = new OpenAI({ timeout: 60_000, maxRetries: 1 });
const discovery = createImageDiscovery(
  client,
  { model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini", maxConcurrent: 4, openverse: process.env.IMAGE_OPENVERSE !== "off" },
  web,
);
console.log(`provider: ${discovery.provider}`);

const rows = [];
async function one(identity) {
  const started = Date.now();
  const result = await discovery.discover(identity);
  const ms = Date.now() - started;
  const row = { identity, ms, ok: result.ok, code: result.ok ? undefined : result.code, cost: cost(result.usage, result.searchCalls), searchCalls: result.searchCalls, failures: result.failures ?? [] };
  if (result.ok) Object.assign(row, { status: result.discovery.status, candidates: result.discovery.candidates, selected: result.discovery.selected });
  rows.push(row);
  const top = row.candidates?.[0];
  console.log(
    `${describe(identity).padEnd(44)} ${String(ms).padStart(6)} ms  ${(row.status ?? `ERROR ${row.code}`).padEnd(7)} cand ${row.candidates?.length ?? 0}  $${row.cost.toFixed(4)}  fail [${row.failures.join(",")}]` +
      (top ? `\n    top: ${top.matchingStatus}/${top.usageRightsStatus} ${top.sourceName} ${top.imageUrl.slice(0, 90)}` : ""),
  );
}

const queue = [...wanted];
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await one(queue.shift()); }));

// Second pass through the cached entry point: must not call any API.
// Shareable answers must come back from the server cache for free; personal pictures must never be shared.
let reused = 0;
let shareableCount = 0;
let leaked = 0;
for (const row of rows) {
  if (!row.ok) continue;
  const shared = discovery.cached(row.identity);
  if (row.status === "personal" && shared?.candidates.some((c) => c.usageRightsStatus !== "permitted")) leaked += 1;
  if (!shared) continue;
  shareableCount += 1;
  const again = await discovery.discover(row.identity);
  if (again.ok && again.cached && again.searchCalls === 0 && !again.usage) reused += 1;
}

const ok = rows.filter((row) => row.ok);
const pct = (n) => `${Math.round((n / rows.length) * 100)}%`;
const times = rows.map((row) => row.ms).sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const found = ok.filter((row) => row.status === "found" || row.status === "personal");
const personal = ok.filter((row) => row.status === "personal");
const withCandidates = ok.filter((row) => row.candidates?.length);
const exact = ok.filter((row) => row.candidates?.some((c) => c.matchingStatus === "exact" || (row.identity.generic && c.matchingStatus === "same-type")));
const permitted = ok.filter((row) => row.candidates?.some((c) => c.usageRightsStatus === "permitted"));
const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
const failures = {};
for (const row of rows) for (const failure of row.failures) failures[failure] = (failures[failure] ?? 0) + 1;

console.log(`\n== ${rows.length} products, provider ${discovery.provider}`);
console.log(`with usable candidates (after validation + matching): ${withCandidates.length} (${pct(withCandidates.length)})`);
console.log(`model says exact product (or right type for generic): ${exact.length} (${pct(exact.length)})`);
console.log(`with a permitted-licence candidate: ${permitted.length} (${pct(permitted.length)})`);
console.log(`applied automatically: ${found.length} (${pct(found.length)}), of which personal (rights unknown, this device only): ${personal.length}`);
console.log(`review only: ${ok.filter((row) => row.status === "review").length}, none: ${ok.filter((row) => row.status === "none").length}, API errors: ${rows.length - ok.length}`);
console.log(`median time ${median} ms, total cost $${totalCost.toFixed(3)}, per product $${(totalCost / rows.length).toFixed(4)}, per applied image $${found.length ? (totalCost / found.length).toFixed(4) : "-"}`);
console.log(`cache reuse without API calls: ${reused}/${shareableCount} shareable answers; personal pictures shared through the cache: ${leaked}`);
console.log(`lead failures: ${JSON.stringify(failures)}`);

const out = args.find((arg) => !arg.startsWith("--"));
if (out) {
  const cells = rows
    .map((row) => {
      const pics = (row.candidates ?? [])
        .map((c, i) => `<figure class="${i === row.selected ? "sel" : ""}"><img src="${c.thumbnailUrl ?? c.imageUrl}" referrerpolicy="no-referrer"><figcaption>${c.matchingStatus} · ${c.usageRightsStatus} · ${c.sourceName}</figcaption></figure>`)
        .join("");
      return `<section><h2>${describe(row.identity)} — ${row.status ?? row.code}</h2><div>${pics || "<em>geen</em>"}</div></section>`;
    })
    .join("");
  writeFileSync(out, `<!doctype html><meta charset="utf-8"><style>body{font:12px sans-serif;margin:8px}section{display:inline-block;width:390px;vertical-align:top;margin:4px;border:1px solid #ccc;padding:4px}h2{font-size:12px;margin:0 0 4px}div{display:flex;gap:4px}figure{margin:0;width:124px}figure.sel{outline:3px solid #1a9}img{width:124px;height:124px;object-fit:contain;background:#f4f4f4}figcaption{font-size:10px}</style>${cells}`);
  console.log(`contact sheet: ${out}`);
}
