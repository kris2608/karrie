export type LimitConfig = {
  perIpPerHour: number;
  perIpPerDay: number;
  dailyRequests: number;
  dailyBudgetUsd: number;
  inputUsdPerMTok: number;
  cachedInputUsdPerMTok: number;
  outputUsdPerMTok: number;
};

export type Usage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

export type Denial = "rate-limited" | "daily-limit" | "budget";

const HOUR = 60 * 60 * 1000;

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export type UsageSnapshot = {
  day: string;
  requests: number;
  costUsd: number;
  /** Recent hit timestamps per subject. Keys are already hashed when a store is attached. */
  hits: Record<string, number[]>;
};

export type UsageStore = {
  load(scope: string): Promise<UsageSnapshot | null>;
  save(scope: string, snapshot: UsageSnapshot): Promise<void>;
};

/**
 * Guards for paid calls. Without a store they live in memory and reset on restart.
 * With a store, `hydrate` loads today's counters and `commit` writes them back,
 * so a free-plan spin-down does not hand out a fresh budget.
 */
export function createLimits(config: LimitConfig, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  let day = dayKey(now());
  let today = { requests: 0, costUsd: 0 };
  const totals = { requests: 0, ok: 0, errors: 0, denied: 0, latencyMs: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 };
  let persistence: { store: UsageStore; scope: string; hash: (value: string) => string } | null = null;
  let durable = false;
  let commitTail: Promise<void> = Promise.resolve();

  function roll() {
    const key = dayKey(now());
    if (key !== day) {
      day = key;
      today = { requests: 0, costUsd: 0 };
      hits.clear();
    }
  }

  function subjectKeys(ip: string, installId?: string): string[] {
    const hash = persistence?.hash;
    const ipKey = hash ? `ip:${hash(ip)}` : ip;
    if (!installId) return [ipKey];
    return [ipKey, hash ? `in:${hash(installId)}` : `in:${installId}`];
  }

  function recentHits(key: string, time: number): number[] {
    return (hits.get(key) ?? []).filter((at) => time - at < 24 * HOUR);
  }

  function snapshot(): UsageSnapshot {
    roll();
    const time = now();
    const stored: Record<string, number[]> = {};
    for (const [key, stamps] of hits) {
      const recent = stamps.filter((at) => time - at < 24 * HOUR);
      if (recent.length) stored[key] = recent;
    }
    return { day, requests: today.requests, costUsd: today.costUsd, hits: stored };
  }

  function costOf(usage: Usage): number {
    const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
    return (
      (uncached * config.inputUsdPerMTok + usage.cachedInputTokens * config.cachedInputUsdPerMTok + usage.outputTokens * config.outputUsdPerMTok) /
      1_000_000
    );
  }

  return {
    /**
     * Reserves one call. With an install id, both that install and the IP must be under the cap.
     * The global day counter still increments once.
     */
    admit(ip: string, installId?: string): Denial | null {
      roll();
      const time = now();
      const keys = subjectKeys(ip, installId).map((key) => ({ key, recent: recentHits(key, time) }));
      let denial: Denial | null = null;
      if (today.costUsd >= config.dailyBudgetUsd) denial = "budget";
      else if (today.requests >= config.dailyRequests) denial = "daily-limit";
      else if (keys.some(({ recent }) => recent.length >= config.perIpPerDay || recent.filter((at) => time - at < HOUR).length >= config.perIpPerHour)) denial = "rate-limited";
      if (denial) {
        totals.denied += 1;
        return denial;
      }
      for (const entry of keys) {
        entry.recent.push(time);
        hits.set(entry.key, entry.recent);
      }
      today.requests += 1;
      totals.requests += 1;
      return null;
    },
    /** Attach Postgres (or a test double). Call `hydrate` before serving traffic. */
    useStore(store: UsageStore, scope: string, hash: (value: string) => string) {
      persistence = { store, scope, hash };
    },
    async hydrate() {
      if (!persistence) return;
      try {
        const saved = await persistence.store.load(persistence.scope);
        roll();
        if (saved && saved.day === day) {
          today = { requests: saved.requests, costUsd: saved.costUsd };
          hits.clear();
          const time = now();
          for (const [key, stamps] of Object.entries(saved.hits)) {
            const recent = stamps.filter((at) => typeof at === "number" && time - at < 24 * HOUR);
            if (recent.length) hits.set(key, recent);
          }
        }
        durable = true;
      } catch {
        durable = false;
      }
    },
    /** Writes the current counters. No-op until a store has loaded successfully. */
    commit() {
      if (!persistence || !durable) return Promise.resolve();
      const { store, scope } = persistence;
      const run = commitTail.then(() => store.save(scope, snapshot()));
      commitTail = run.then(() => undefined, () => undefined);
      return run;
    },
    /** extraUsd covers what tokens do not show, such as paid web search calls. */
    record(outcome: { ok: boolean; latencyMs: number; usage?: Usage; extraUsd?: number }) {
      roll();
      if (outcome.ok) totals.ok += 1;
      else totals.errors += 1;
      totals.latencyMs += outcome.latencyMs;
      if (outcome.extraUsd) {
        today.costUsd += outcome.extraUsd;
        totals.costUsd += outcome.extraUsd;
      }
      if (outcome.usage) {
        const cost = costOf(outcome.usage);
        today.costUsd += cost;
        totals.costUsd += cost;
        totals.inputTokens += outcome.usage.inputTokens;
        totals.cachedInputTokens += outcome.usage.cachedInputTokens;
        totals.outputTokens += outcome.usage.outputTokens;
      }
    },
    costOf,
    stats() {
      roll();
      const finished = totals.ok + totals.errors;
      return {
        day,
        today: { requests: today.requests, costUsd: Number(today.costUsd.toFixed(5)) },
        totals: {
          ...totals,
          costUsd: Number(totals.costUsd.toFixed(5)),
          avgLatencyMs: finished ? Math.round(totals.latencyMs / finished) : 0,
        },
      };
    },
  };
}

export type Limits = ReturnType<typeof createLimits>;
