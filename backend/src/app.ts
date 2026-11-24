import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './lib/logger';
import { requestId } from './middleware/request-id';
import { errorHandler, notFound } from './middleware/error-handler';
import { healthRouter } from './modules/health.routes';
import { apiRouter } from './routes';
import { buildOpenApiDocument } from './docs/openapi';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      // Only the method, path and status: bodies can hold passwords.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      // No origins configured: same-origin only (the web app is served behind the same host in production).
      origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);
  app.use('/api/v1', apiRouter);

  // Under /api so the web app's nginx forwards them too. Built once at start-up from the same zod schemas that
  // validate requests.
  if (env.API_DOCS_ENABLED) {
    const document = buildOpenApiDocument();
    app.get('/api/openapi.json', (_req, res) => {
      res.json(document);
    });
    app.use(
      '/api/docs',
      swaggerUi.serve,
      swaggerUi.setup(document, {
        customSiteTitle: 'Outlet HQ API',
        swaggerOptions: {
          persistAuthorization: true,
          displayRequestDuration: true,
          docExpansion: 'list',
          defaultModelsExpandDepth: 0,
          filter: true,
        },
      }),
    );
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
