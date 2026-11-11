import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize the Render PostgreSQL database.");
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  scriptDirectory,
  "../netlify/database/migrations/20261111130000_private_game_storage.sql",
);
const migration = await readFile(migrationPath, "utf8");
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

try {
  await pool.query(migration);
  console.info("Private game database schema is ready.");
} finally {
  await pool.end();
}
