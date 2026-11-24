import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { Router } from 'express';
import { createApp } from '../../src/app';
import { API_BASE, buildOpenApiDocument, operations } from '../../src/docs/openapi';

interface Layer {
  rawPath?: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
}

/** Every method and path the Express app really serves, in OpenAPI form (`/outlets/{outletId}`). */
function servedRoutes(stack: Layer[], prefix = ''): string[] {
  return stack.flatMap((layer) => {
    if (layer.route) {
      const path = (prefix + layer.route.path).replace(/\/$/, '') || '/';
      return Object.keys(layer.route.methods).map((method) => `${method} ${path}`);
    }
    if (layer.handle.stack) {
      const mount = layer.rawPath && layer.rawPath !== '/' ? layer.rawPath : '';
      return servedRoutes(layer.handle.stack, prefix + mount);
    }
    return [];
  });
}

const toOpenApiPath = (route: string) => route.replace(/:(\w+)/g, '{$1}');

describe('OpenAPI document', () => {
  const document = buildOpenApiDocument();

  it('is a valid OpenAPI 3.1 document', async () => {
    // validate() dereferences in place, so give it a copy.
    await expect(SwaggerParser.validate(structuredClone(document) as never)).resolves.toBeTruthy();
    expect(document.openapi).toBe('3.1.0');
  });

  it('documents every route the app serves, and nothing it does not', () => {
    const app = createApp() as unknown as { router: Router & { stack: Layer[] } };
    const served = servedRoutes(app.router.stack)
      .map(toOpenApiPath)
      // The documentation endpoints themselves are not part of the API.
      .filter((route) => !route.endsWith(' /api/openapi.json'))
      .sort();
    const documented = operations
      .map((op) => `${op.method} ${op.root ? '' : API_BASE}${op.path}`)
      .sort();
    expect(documented).toEqual(served);
  });

  it('gives every operation a unique id, a tag, a success response and the right security', () => {
    const ids = new Set<string>();
    for (const [path, item] of Object.entries(document.paths ?? {})) {
      for (const [method, op] of Object.entries(item as Record<string, Record<string, unknown>>)) {
        const where = `${method.toUpperCase()} ${path}`;
        const operationId = op.operationId as string;
        expect(operationId, where).toBeTruthy();
        expect(ids.has(operationId), `${where}: duplicate operationId`).toBe(false);
        ids.add(operationId);
        expect((op.tags as string[]).length, where).toBe(1);
        const statuses = Object.keys(op.responses as object);
        expect(
          statuses.some((status) => status.startsWith('2')),
          where,
        ).toBe(true);

        const isPublic = ['/auth/login', '/health', '/ready'].includes(path);
        expect(op.security, where).toEqual(isPublic ? [] : [{ bearerAuth: [] }]);
        if (!isPublic) expect(statuses, `${where}: 401 documented`).toContain('401');
      }
    }
    expect(ids.size).toBe(operations.length);
  });

  it('takes request rules from the same schemas the API validates with', () => {
    const sale = document.paths?.['/outlets/{outletId}/sales']?.post as {
      requestBody: { content: Record<string, { schema: Record<string, unknown> }> };
      parameters: { name: string; in: string }[];
    };
    const body = sale.requestBody.content['application/json']!.schema as {
      required: string[];
      additionalProperties: boolean;
      properties: { items: { minItems: number; maxItems: number } };
    };
    expect(body.required).toEqual(expect.arrayContaining(['items', 'paymentMethod']));
    // .strict() in the request schema: unknown fields are rejected, and the document says so.
    expect(body.additionalProperties).toBe(false);
    expect(body.properties.items).toMatchObject({ minItems: 1, maxItems: 50 });
    expect(sale.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'outletId', in: 'path' }),
        expect.objectContaining({ name: 'Idempotency-Key', in: 'header' }),
      ]),
    );
  });

  it('is not served when API_DOCS_ENABLED is false', async () => {
    vi.resetModules();
    vi.doMock('../../src/config/env', async (importOriginal) => {
      const original = await importOriginal<typeof import('../../src/config/env')>();
      return { ...original, env: { ...original.env, API_DOCS_ENABLED: false } };
    });
    const { createApp: createAppWithoutDocs } = await import('../../src/app');
    const app = createAppWithoutDocs();
    for (const path of ['/api/openapi.json', '/api/docs/']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    }
    vi.doUnmock('../../src/config/env');
  });
});
