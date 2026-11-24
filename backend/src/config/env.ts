import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_EXPIRES_IN must look like 30m, 8h or 7d')
    .default('8h'),
  CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/, 'CURRENCY must be a three-letter ISO 4217 code')
    .default('MYR'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Proxy hops in front of the API (a load balancer, nginx): makes req.ip the client for rate limits.
  // Sign-in attempts per client address per minute (raise it only for automated end-to-end runs).
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(10),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  RUN_MIGRATIONS: booleanFromString.default('false'),
  SEED_DEMO_DATA: booleanFromString.default('false'),
});

export type Env = z.infer<typeof schema>;

/** Validates a set of variables; throws one error listing every problem. Exported for tests. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // The process cannot run with a bad configuration: fail loudly at start-up instead of later at request time.
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const env: Env = parseEnv(process.env);
export const isProduction = env.NODE_ENV === 'production';
