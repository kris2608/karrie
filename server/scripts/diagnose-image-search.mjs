// Standalone check of OpenAI Responses web image search, configured as in
// https://developers.openai.com/api/docs/guides/tools-web-search#image-search-results
// Usage (from server/): node scripts/diagnose-image-search.mjs [model ...]
// Reads OPENAI_API_KEY from the environment or server/.env. Prints no secrets.
import { existsSync } from "node:fs";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY && existsSync(".env")) process.loadEnvFile(".env");

const PRODUCTS = [
  "AH Terra 100% Pindakaas Naturel",
  "Almhof Griekse Yoghurt 10% vet 1 kg",
  "Brinta Volkoren Graanontbijt 500 g",
  "banaan (los fruit)",
  "Campina Halfvolle Melk 1 liter pak",
];
const models = process.argv.slice(2).length ? process.argv.slice(2) : ["gpt-5.4-mini"];
const client = new OpenAI({ timeout: 90_000, maxRetries: 0 });

async function reachable(url) {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "KarrieImageCheck/1.0" } });
    return `${response.status} ${(response.headers.get("content-type") ?? "").split(";")[0]}`;
  } catch (error) {
    return `error ${error.name}`;
  }
}

const rows = [];
for (const model of models) {
  for (const product of PRODUCTS) {
    const started = Date.now();
    const row = { model, product, ms: 0, status: "", searchCalls: 0, emptyCalls: 0, imageResults: 0, textResults: 0, hosts: [], images: [], error: null, usage: null };
    try {
      const response = await client.responses.create({
        model,
        reasoning: { effort: "low" },
        store: false,
        tools: [{ type: "web_search", search_content_types: ["image", "text"], image_settings: { max_results: 3, caption: true } }],
        tool_choice: "required",
        include: ["web_search_call.results"],
        input: `Search for product photos of: ${product}. Prefer a clear front-facing packshot.`,
      });
      row.status = response.status;
      row.usage = response.usage ? { in: response.usage.input_tokens, out: response.usage.output_tokens } : null;
      for (const item of response.output) {
        if (item.type !== "web_search_call") continue;
        if (item.action?.type === "search") row.searchCalls += 1;
        const results = item.results ?? [];
        if (!results.length) row.emptyCalls += 1;
        for (const result of results) {
          if (result.type === "image_result") {
            row.imageResults += 1;
            row.images.push({ image: result.image_url, thumb: result.thumbnail_url, source: result.source_website_url, caption: result.caption });
          } else row.textResults += 1;
          try {
            row.hosts.push(new URL(result.source_website_url ?? result.url).hostname.replace(/^www\./, ""));
          } catch {}
        }
      }
    } catch (error) {
      row.error = `${error.constructor?.name ?? "Error"} ${error.status ?? ""} ${error.code ?? ""} ${String(error.message ?? "").slice(0, 160)}`.trim();
    }
    row.ms = Date.now() - started;
    for (const image of row.images.slice(0, 3)) image.reachable = await reachable(image.thumb ?? image.image);
    rows.push(row);
    console.log(`\n[${model}] ${product}`);
    console.log(`  ${row.ms} ms, status ${row.status || "-"}, search calls ${row.searchCalls} (empty ${row.emptyCalls}), image_result ${row.imageResults}, text_result ${row.textResults}, tokens ${JSON.stringify(row.usage)}`);
    if (row.error) console.log(`  ERROR ${row.error}`);
    console.log(`  hosts: ${[...new Set(row.hosts)].slice(0, 10).join(", ") || "-"}`);
    for (const image of row.images.slice(0, 3)) console.log(`  IMG ${image.image} | src ${image.source} | ${image.reachable} | ${String(image.caption ?? "").slice(0, 80)}`);
  }
}

const total = rows.length;
const withImages = rows.filter((row) => row.imageResults > 0).length;
console.log(`\nSummary: ${withImages}/${total} requests returned at least one image_result; errors ${rows.filter((row) => row.error).length}/${total}.`);
