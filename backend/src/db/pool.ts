import { Pool, PoolClient, types } from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';

// BIGINT (20) and NUMERIC (1700) arrive as strings. Our BIGINT values are cent totals and counts, far below 2^53,
// so they are safe as numbers; refuse anything that is not, rather than lose precision silently.
const toSafeNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Database value ${value} does not fit a safe integer`);
  }
  return parsed;
};
types.setTypeParser(20, toSafeNumber);
types.setTypeParser(1700, toSafeNumber);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'outlet-hq-api',
});

pool.on('error', (error) => {
  // An idle client lost its connection; the pool replaces it. Log it so a flapping database is visible.
  logger.error({ err: error }, 'Idle PostgreSQL client error');
});

/** Anything that can run a query: the pool, or a client inside a transaction. Repositories take this. */
export type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;
