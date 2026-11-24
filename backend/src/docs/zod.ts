import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds .openapi() (names, examples, descriptions) to every zod schema. Imported before any schema that uses it.
extendZodWithOpenApi(z);

export { z };
