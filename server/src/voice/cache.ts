import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { normalizeSpeechKey } from "./allowlist.js";

export type VoiceCacheEntry = {
  audio: Buffer;
  contentType: string;
  model: string;
  voice: string;
};

export type VoiceCache = {
  get(key: string): Promise<VoiceCacheEntry | null>;
  set(key: string, entry: VoiceCacheEntry): Promise<void>;
  stats(): { hits: number; misses: number; size: number; storage: "memory" | "postgres" };
};

export function voiceCacheKey(parts: {
  text: string;
  language: string;
  voice: string;
  instructionVersion: string;
  model: string;
}): string {
  const raw = [normalizeSpeechKey(parts.text), parts.language, parts.voice, parts.instructionVersion, parts.model].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/** In-process cache; lost on Render restart. Used when Postgres is unavailable. */
export function createMemoryVoiceCache(maxEntries = 500): VoiceCache {
  const map = new Map<string, VoiceCacheEntry>();
  let hits = 0;
  let misses = 0;
  return {
    async get(key) {
      const hit = map.get(key);
      if (!hit) {
        misses += 1;
        return null;
      }
      hits += 1;
      // Refresh LRU order.
      map.delete(key);
      map.set(key, hit);
      return hit;
    },
    async set(key, entry) {
      if (map.has(key)) map.delete(key);
      map.set(key, entry);
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    stats: () => ({ hits, misses, size: map.size, storage: "memory" }),
  };
}

export function createPgVoiceCache(pool: Pool, maxMemory = 200): VoiceCache {
  const memory = createMemoryVoiceCache(maxMemory);
  let hits = 0;
  let misses = 0;
  return {
    async get(key) {
      const local = await memory.get(key);
      if (local) {
        hits += 1;
        return local;
      }
      try {
        const result = await pool.query<{ audio: Buffer; content_type: string; model: string; voice: string }>(
          `select audio, content_type, model, voice from voice_cache where cache_key = $1 and expires_at > now()`,
          [key],
        );
        const row = result.rows[0];
        if (!row) {
          misses += 1;
          return null;
        }
        const entry: VoiceCacheEntry = {
          audio: Buffer.isBuffer(row.audio) ? row.audio : Buffer.from(row.audio),
          contentType: row.content_type,
          model: row.model,
          voice: row.voice,
        };
        await memory.set(key, entry);
        hits += 1;
        return entry;
      } catch {
        misses += 1;
        return null;
      }
    },
    async set(key, entry) {
      await memory.set(key, entry);
      try {
        await pool.query(
          `insert into voice_cache (cache_key, audio, content_type, model, voice, created_at, expires_at)
           values ($1, $2, $3, $4, $5, now(), now() + interval '90 days')
           on conflict (cache_key) do update set
             audio = excluded.audio,
             content_type = excluded.content_type,
             model = excluded.model,
             voice = excluded.voice,
             expires_at = excluded.expires_at`,
          [key, entry.audio, entry.contentType, entry.model, entry.voice],
        );
      } catch {
        // Memory still holds the clip for this process.
      }
    },
    stats: () => {
      const mem = memory.stats();
      return { hits, misses, size: mem.size, storage: "postgres" };
    },
  };
}
