import { PoolClient } from 'pg';
import { pool } from './pool';
import { logger } from '../lib/logger';

// Deadlock and serialization failure: safe to retry the whole transaction.
const RETRYABLE = new Set(['40P01', '40001']);

export interface TransactionOptions {
  /** Attempts in total when the database asks for a retry (default 3). */
  attempts?: number;
  /** Give up waiting for a row lock after this many milliseconds (default 5000). */
  lockTimeoutMs?: number;
  /** Cancel any single statement after this many milliseconds (default 15000). */
  statementTimeoutMs?: number;
}

/**
 * Runs `work` in one transaction: commits when it returns, rolls back when it throws. A deadlock or serialization
 * failure is retried with a short backoff, so callers must not have side effects outside the database in `work`.
 */
export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
  { attempts = 3, lockTimeoutMs = 5_000, statementTimeoutMs = 15_000 }: TransactionOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL lock_timeout = ${Math.trunc(lockTimeoutMs)}`);
      await client.query(`SET LOCAL statement_timeout = ${Math.trunc(statementTimeoutMs)}`);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = (error as { code?: string }).code;
      if (code && RETRYABLE.has(code) && attempt < attempts) {
        logger.warn({ code, attempt }, 'Retrying transaction');
        await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
