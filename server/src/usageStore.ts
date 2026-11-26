import type { PoolLike } from "./candidatesPg.js";
import type { UsageSnapshot, UsageStore } from "./limits.js";

const UPSERT = `INSERT INTO usage_state (scope, day, requests, cost_usd, hits, updated_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (scope) DO UPDATE SET
  day = EXCLUDED.day,
  requests = EXCLUDED.requests,
  cost_usd = EXCLUDED.cost_usd,
  hits = EXCLUDED.hits,
  updated_at = now()`;

function parseHits(value: unknown): Record<string, number[]> {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const hits: Record<string, number[]> = {};
    for (const [key, stamps] of Object.entries(parsed)) {
      if (!Array.isArray(stamps)) continue;
      const numbers = stamps.filter((stamp): stamp is number => typeof stamp === "number" && Number.isFinite(stamp));
      if (numbers.length) hits[key] = numbers;
    }
    return hits;
  } catch {
    return {};
  }
}

/** One row per limit scope. Hits are hashed subject keys, never raw IP addresses. */
export function createPgUsageStore(pool: PoolLike): UsageStore {
  return {
    async load(scope) {
      const { rows } = await pool.query(
        "SELECT day, requests, cost_usd, hits FROM usage_state WHERE scope = $1",
        [scope],
      );
      const row = rows[0];
      if (!row) return null;
      const requests = Number(row.requests);
      const costUsd = Number(row.cost_usd);
      return {
        day: String(row.day),
        requests: Number.isFinite(requests) ? requests : 0,
        costUsd: Number.isFinite(costUsd) ? costUsd : 0,
        hits: parseHits(row.hits),
      } satisfies UsageSnapshot;
    },
    async save(scope, snapshot) {
      await pool.query(UPSERT, [scope, snapshot.day, snapshot.requests, snapshot.costUsd, JSON.stringify(snapshot.hits)]);
    },
  };
}
