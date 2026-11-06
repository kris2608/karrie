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

/**
 * In-memory guards. They reset when the process restarts, so the OpenAI
 * project budget remains the hard spending cap.
 */
export function createLimits(config: LimitConfig, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  let day = dayKey(now());
  let today = { requests: 0, costUsd: 0 };
  const totals = { requests: 0, ok: 0, errors: 0, denied: 0, latencyMs: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 };

  function roll() {
    const key = dayKey(now());
    if (key !== day) {
      day = key;
      today = { requests: 0, costUsd: 0 };
      hits.clear();
    }
  }

  function costOf(usage: Usage): number {
    const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
    return (
      (uncached * config.inputUsdPerMTok + usage.cachedInputTokens * config.cachedInputUsdPerMTok + usage.outputTokens * config.outputUsdPerMTok) /
      1_000_000
    );
  }

  return {
    /** Reserves a slot for one recognition, or says why it is refused. */
    admit(ip: string): Denial | null {
      roll();
      const time = now();
      const recent = (hits.get(ip) ?? []).filter((at) => time - at < 24 * HOUR);
      let denial: Denial | null = null;
      if (today.costUsd >= config.dailyBudgetUsd) denial = "budget";
      else if (today.requests >= config.dailyRequests) denial = "daily-limit";
      else if (recent.length >= config.perIpPerDay || recent.filter((at) => time - at < HOUR).length >= config.perIpPerHour) denial = "rate-limited";
      if (denial) {
        totals.denied += 1;
        return denial;
      }
      recent.push(time);
      hits.set(ip, recent);
      today.requests += 1;
      totals.requests += 1;
      return null;
    },
    record(outcome: { ok: boolean; latencyMs: number; usage?: Usage }) {
      roll();
      if (outcome.ok) totals.ok += 1;
      else totals.errors += 1;
      totals.latencyMs += outcome.latencyMs;
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
