import { Pool } from "pg";
import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('idealab_migrations',0))",
  );
  await c.query(
    "CREATE TABLE IF NOT EXISTS idealab_migrations (id TEXT PRIMARY KEY, at TIMESTAMPTZ DEFAULT NOW())",
  );
  const id = "202611030001_init";
  const old = await c.query("SELECT id FROM idealab_migrations WHERE id=$1", [
    id,
  ]);
  if (!old.rowCount) {
    await c.query(
      readFileSync("prisma/migrations/" + id + "/migration.sql", "utf8"),
    );
    await c.query("INSERT INTO idealab_migrations(id) VALUES($1)", [id]);
    console.log("Applied", id);
  } else console.log("Migration already applied");
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
