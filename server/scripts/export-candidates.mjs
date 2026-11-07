// Exports catalog candidates for a manual review; nothing here changes the app's catalog.
// Usage (from server/): npm run candidates:export -- [--status=pending|approved|rejected|all] [--format=json|csv]
// Reads CANDIDATES_FILE, or with KARRIE_API_URL and CANDIDATES_ADMIN_TOKEN asks a running server. Prints no secrets.
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const status = args.status ?? "pending";
const format = args.format ?? "json";
if (!["pending", "approved", "rejected", "all"].includes(status) || !["json", "csv"].includes(format)) {
  console.error("Use --status=pending|approved|rejected|all and --format=json|csv");
  process.exit(1);
}

async function load() {
  const api = process.env.KARRIE_API_URL;
  const token = process.env.CANDIDATES_ADMIN_TOKEN;
  if (api && token) {
    const query = status === "all" ? "" : `?status=${status}`;
    const response = await fetch(`${api.replace(/\/$/, "")}/api/admin/candidates${query}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Server answered ${response.status}`);
    return (await response.json()).candidates;
  }
  const file = process.env.CANDIDATES_FILE;
  if (!file || !existsSync(file)) throw new Error("Set CANDIDATES_FILE, or KARRIE_API_URL and CANDIDATES_ADMIN_TOKEN");
  const candidates = JSON.parse(readFileSync(file, "utf8")).candidates ?? [];
  return candidates.filter((candidate) => status === "all" || candidate.approvalStatus === status).sort((a, b) => b.usageCount - a.usageCount);
}

const FIELDS = ["candidateId", "displayName", "canonicalName", "singularName", "pluralName", "category", "subcategory", "closestDrawing", "usageCount", "firstSeenAt", "lastSeenAt", "createdFrom", "approvalStatus", "searchKeys"];
const cell = (value) => {
  const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

try {
  const candidates = await load();
  if (format === "csv") {
    console.log(FIELDS.join(","));
    for (const candidate of candidates) console.log(FIELDS.map((field) => cell(candidate[field])).join(","));
  } else {
    console.log(JSON.stringify(candidates, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Export failed");
  process.exit(1);
}
