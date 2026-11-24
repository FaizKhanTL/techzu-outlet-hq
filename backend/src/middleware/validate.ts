import type { Request, RequestHandler } from 'express';
import { z, ZodError, type ZodTypeAny } from 'zod';

export interface RequestSchemas {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
}

type Parsed<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends ZodTypeAny ? z.infer<S[K]> : never;
};

/** Parses params, query and body with the given schemas; all problems are reported together as one 400. */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: z.ZodIssue[] = [];
    const validated: Record<string, unknown> = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({ ...issue, path: [part, ...issue.path] })),
        );
      }
    }
    if (issues.length > 0) {
      next(new ZodError(issues));
      return;
    }
    req.validated = validated;
    next();
  };
}

/** The input validate() parsed for this route, typed from the same schemas object. */
export function validated<S extends RequestSchemas>(req: Request, _schemas: S): Parsed<S> {
  if (!req.validated) {
    throw new Error('validated() was called on a route without the validate() middleware');
  }
  return req.validated as Parsed<S>;
}
