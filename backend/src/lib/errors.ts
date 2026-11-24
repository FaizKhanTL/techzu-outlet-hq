/** An error the API answers with on purpose: a status, a stable machine code and a message safe to show. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown, code = 'BAD_REQUEST') {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource.', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, code = 'NOT_FOUND') {
    super(404, code, `${resource} was not found.`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown, code = 'CONFLICT') {
    super(409, code, message, details);
  }
}

/** The request is well formed but breaks a business rule (an item not on this outlet's menu, a paused item). */
export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown, code = 'UNPROCESSABLE') {
    super(422, code, message, details);
  }
}
