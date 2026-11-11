import "server-only";

import { getConnectionString } from "@netlify/database";
import { Pool } from "pg";

declare global {
  var netlifyDatabasePool: Pool | undefined;
}

export function getNetlifyDatabasePool() {
  if (globalThis.netlifyDatabasePool) return globalThis.netlifyDatabasePool;

  const connectionString = getConnectionString();
  globalThis.netlifyDatabasePool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return globalThis.netlifyDatabasePool;
}
