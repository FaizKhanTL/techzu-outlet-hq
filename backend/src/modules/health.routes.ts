import { Router } from 'express';
import { pool } from '../db/pool';

export const healthRouter = Router();

// Liveness: the process answers. Does not touch the database, so a database outage does not restart the API.
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Readiness: the API can serve traffic (the database answers).
healthRouter.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
