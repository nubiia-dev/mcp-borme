import { z } from 'zod';

import { withValidation } from '../validation.js';

/** JSON Schema object advertised to MCP clients in `tools/list`. */
export interface ToolInputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * zod encodes `z.number().int()` as bounded by Number.MAX_SAFE_INTEGER. The
 * bound is noise for a model reading the schema, so it is dropped.
 */
function stripSafeIntegerBounds(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(stripSafeIntegerBounds);
  } else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    for (const key of ['minimum', 'maximum']) {
      if (Math.abs(Number(record[key])) === Number.MAX_SAFE_INTEGER) delete record[key];
    }
    Object.values(record).forEach(stripSafeIntegerBounds);
  }
}

/**
 * Derives the MCP `inputSchema` from the zod schema that also validates the
 * call, so the schema the model sees can never drift from what the handler
 * enforces. `io: 'input'` keeps defaults optional (the caller may omit them).
 */
export function toInputSchema(schema: z.ZodType): ToolInputSchema {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  delete json.additionalProperties;
  stripSafeIntegerBounds(json);
  return { type: 'object', required: [], ...json } as ToolInputSchema;
}

/**
 * Builds one tool definition. Every tool of this server only reads from
 * OpenMercantil, so `readOnlyHint` is always true.
 *
 * @param definition.description - What the tool returns and WHEN to use it (shown to the model).
 * @param definition.schema - Zod schema validating the arguments; also the source of the JSON Schema.
 * @param definition.handler - Receives validated arguments with defaults applied.
 */
export function defineTool<S extends z.ZodType>(definition: {
  description: string;
  schema: S;
  handler: (args: z.output<S>) => Promise<unknown>;
}) {
  return {
    description: definition.description,
    inputSchema: toInputSchema(definition.schema),
    readOnlyHint: true as const,
    handler: withValidation<z.output<S>, unknown>(
      definition.schema as z.ZodType<z.output<S>>,
      definition.handler
    ),
  };
}
