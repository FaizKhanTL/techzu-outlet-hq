import { AppError } from './errors';

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests. Please wait a moment and try again.') {
    super(429, 'RATE_LIMITED', message);
  }
}
