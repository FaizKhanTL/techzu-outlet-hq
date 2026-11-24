import { AppError, BadRequestError, ConflictError } from './errors';

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

const isPgError = (error: unknown): error is PgError =>
  typeof error === 'object' && error !== null && typeof (error as PgError).code === 'string';

/**
 * A database error a client can cause, as an AppError; undefined for everything else (a real 500). Services check
 * the expected cases first with clear messages; this is the safety net, so no constraint ever surfaces as a 500.
 */
export function fromPgError(error: unknown): AppError | undefined {
  if (!isPgError(error)) return undefined;
  switch (error.code) {
    case '23505':
      return new ConflictError(
        'A record with the same unique value already exists.',
        { constraint: error.constraint },
        'DUPLICATE',
      );
    case '23503':
      return new ConflictError(
        'The record is referenced by, or refers to, a record that does not exist.',
        { constraint: error.constraint },
        'REFERENCE_CONFLICT',
      );
    case '23514':
      return new ConflictError(
        'The change breaks a data rule.',
        { constraint: error.constraint },
        'CONSTRAINT_VIOLATION',
      );
    case '22P02':
    case '22003':
      return new BadRequestError(
        'A value has the wrong format or is out of range.',
        undefined,
        'INVALID_VALUE',
      );
    case '55P03':
      return new AppError(503, 'BUSY', 'The data is busy with another request. Please retry.');
    case '57014':
      return new AppError(503, 'TIMEOUT', 'The request took too long. Please retry.');
    default:
      return undefined;
  }
}
