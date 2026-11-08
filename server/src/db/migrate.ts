import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Queryable } from "../candidatesPg.js";

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);`;

const LOCK_KEY = 260_801;

export type MigrationResult = { applied: string[]; skipped: string[]; migrationsDir: string };

/** Prefer cwd/migrations (Render rootDir = server); fall back next to the compiled module. */
export function resolveMigrationsDir(preferred?: string): string {
  if (preferred) return preferred;
  const fromCwd = join(process.cwd(), "migrations");
  if (existsSync(fromCwd)) return fromCwd;
  return join(fileURLToPath(new URL(".", import.meta.url)), "../../migrations");
}

export async function listMigrationFiles(dir: string): Promise<{ version: string; file: string; path: string }[]> {
  const names = (await readdir(dir)).filter((name) => /^\d{3}_.+\.sql$/i.test(name)).sort();
  return names.map((file) => ({ version: file.slice(0, 3), file, path: join(dir, file) }));
}

async function tableExists(db: Queryable, name: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 AS ok FROM information_schema.tables WHERE table_name = $1 LIMIT 1`, [name]);
  return rows.length > 0;
}

/**
 * Applies pending `NNN_*.sql` files once, under an advisory lock when available.
 * Marks `001` as applied when the candidates table already exists from the older bootstrapping path.
 */
export async function migrate(db: Queryable, dir = resolveMigrationsDir()): Promise<MigrationResult> {
  let locked = false;
  try {
    await db.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    locked = true;
  } catch {
    /* pg-mem and some hosts have no advisory locks; continue without. */
  }

  try {
    await db.query(MIGRATIONS_TABLE);

    if (await tableExists(db, "candidates")) {
      await db.query(`INSERT INTO schema_migrations (version) VALUES ('001') ON CONFLICT (version) DO NOTHING`);
    }

    const files = await listMigrationFiles(dir);
    const { rows: done } = await db.query("SELECT version FROM schema_migrations");
    const appliedSet = new Set(done.map((row) => String(row.version)));
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const entry of files) {
      if (appliedSet.has(entry.version)) {
        skipped.push(entry.version);
        continue;
      }
      const sql = await readFile(entry.path, "utf8");
      await db.query("BEGIN");
      try {
        await db.query(sql);
        await db.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [entry.version]);
        await db.query("COMMIT");
        applied.push(entry.version);
      } catch (error) {
        await db.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }

    return { applied, skipped, migrationsDir: dir };
  } finally {
    if (locked) {
      try {
        await db.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      } catch {
        /* ignore */
      }
    }
  }
}
