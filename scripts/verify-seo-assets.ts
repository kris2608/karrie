import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

function read(file: string): string {
  const full = path.join(dist, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file} in dist/ — SEO asset was not published.`);
  return fs.readFileSync(full, "utf8");
}

const sitemap = read("sitemap.xml");
if (!sitemap.includes("<urlset") || !sitemap.includes("https://www.karrie.eu/ontdek")) {
  throw new Error("dist/sitemap.xml is not a valid Karrie sitemap.");
}
if (sitemap.includes("<!doctype html>") || sitemap.includes("<html")) {
  throw new Error("dist/sitemap.xml looks like HTML (SPA fallback leak).");
}

const robots = read("robots.txt");
if (!robots.includes("Sitemap: https://www.karrie.eu/sitemap.xml")) {
  throw new Error("dist/robots.txt must reference https://www.karrie.eu/sitemap.xml");
}
if (!robots.includes("Allow: /sitemap.xml")) {
  throw new Error("dist/robots.txt must explicitly allow /sitemap.xml");
}
if (/^Disallow:\s*\/s\s*$/m.test(robots)) {
  throw new Error('Disallow: /s (without trailing slash) would block /sitemap.xml');
}

console.log("SEO assets OK: dist/sitemap.xml and dist/robots.txt");
