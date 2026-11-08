import pg from "pg";
import { dedupeKey, type Candidate, type CandidatePersistence } from "./candidates.js";

/** Same statement as migrations/001_candidates.sql; the adapter runs it at start so a fresh database works at once. */
export const CANDIDATES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS candidates (
  candidate_id text PRIMARY KEY,
  dedupe_key text UNIQUE NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);`;

type Rows = { rows: Record<string, unknown>[] };
export type Queryable = { query(text: string, values?: unknown[]): Promise<Rows> };
export type PoolLike = Queryable & { connect(): Promise<Queryable & { release(): void }> };

const UPSERT = `INSERT INTO candidates (candidate_id, dedupe_key, data, updated_at) VALUES ($1, $2, $3, now())
ON CONFLICT (candidate_id) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`;

function parse(value: unknown): Candidate | null {
  const data = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return data && typeof data === "object" && "candidateId" in data && "canonicalName" in data ? (data as Candidate) : null;
}

/** Keeps candidates in Postgres: one row per candidate, only changed rows are written. */
export function postgresStorage(pool: PoolLike): CandidatePersistence {
  return {
    kind: "postgres",
    async load() {
      await pool.query(CANDIDATES_TABLE_SQL);
      const { rows } = await pool.query("SELECT data FROM candidates");
      return rows.map((row) => parse(row.data)).filter((candidate): candidate is Candidate => candidate !== null);
    },
    async write({ changed, removed }) {
      if (!changed.length && !removed.length) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const candidateId of removed) await client.query("DELETE FROM candidates WHERE candidate_id = $1", [candidateId]);
        for (const candidate of changed) await client.query(UPSERT, [candidate.candidateId, dedupeKey(candidate), JSON.stringify(candidate)]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** A small pool; idle connection errors (a database restart) must not stop the server. */
export function createPgPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  pool.on("error", () => undefined);
  return pool;
}
