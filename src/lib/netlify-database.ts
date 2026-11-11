import "server-only";

import { getConnectionString } from "@netlify/database";
import { Pool } from "pg";

declare global {
  var netlifyDatabasePool: Pool | undefined;
}

export function getNetlifyDatabasePool() {
  if (globalThis.netlifyDatabasePool) return globalThis.netlifyDatabasePool;

  const connectionString = process.env.DATABASE_URL?.trim()
    || (process.env.NETLIFY ? getConnectionString() : undefined);
  if (!connectionString) {
    throw new Error("Configure DATABASE_URL or deploy in a Netlify environment with Netlify Database enabled.");
  }
  globalThis.netlifyDatabasePool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return globalThis.netlifyDatabasePool;
}
