import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, NotFoundError } from '../lib/errors';
import { fromPgError } from '../lib/pg-errors';
import { logger } from '../lib/logger';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
};

interface BodyParserError {
  type?: string;
  status?: number;
}

/** The one place errors become responses: { error: { code, message, details?, requestId } }. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let appError: AppError;
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new AppError(
      400,
      'VALIDATION_ERROR',
      'The request is not valid.',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  } else if ((error as BodyParserError).type === 'entity.parse.failed') {
    appError = new AppError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  } else if ((error as BodyParserError).type === 'entity.too.large') {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  } else {
    appError =
      fromPgError(error) ??
      new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again later.');
  }

  if (appError.status >= 500) {
    logger.error({ err: error, requestId: req.requestId }, 'Request failed');
  }
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
      requestId: req.requestId,
    },
  });
};
