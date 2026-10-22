import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { OpenMercantilClient } from './openmercantil-client.js';
import { getBulletinTools } from './tools/bulletin.js';
import { getCompanyTools } from './tools/companies.js';
import { getCompanySourceTools } from './tools/company-sources.js';
import { getLegalTools } from './tools/legal.js';
import { getPersonTools } from './tools/persons.js';
import { getSectorTools } from './tools/sectors.js';
import { getSystemTools } from './tools/system.js';
import { getTenderTools } from './tools/tenders.js';
import { serializeResult } from './utils/config.js';
import { RateLimiter } from './utils/rate-limiter.js';

/** Key of the limiter window shared by every tool (OpenMercantil's quota is global per IP/key). */
export const GLOBAL_LIMIT_KEY = '__all_tools__';

/** Words that stay upper-case in generated tool titles. */
const ACRONYMS = new Set(['cnae', 'ted', 'cnmv', 'bde']);

/**
 * Human-readable title for a tool name: `borme_get_company_ted` -> "Get company TED".
 */
export function toolTitle(name: string): string {
  const words = name
    .replace(/^borme_/, '')
    .split('_')
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word));
  const title = words.join(' ');
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export interface ServerOptions {
  client: OpenMercantilClient;
  version: string;
  /** Requests per minute allowed across all tools together. */
  requestsPerMinute: number;
  /** Maximum serialized size of a tool response. */
  maxResponseChars: number;
  /** Requests per minute allowed for each single tool. Defaults to 30. */
  perToolRequestsPerMinute?: number;
}

/**
 * Builds the MCP server: tool registry, `tools/list` and `tools/call` handlers,
 * rate limiting and response-size capping. Transport wiring lives in index.ts so
 * this can be driven in tests through an in-memory transport.
 *
 * OpenMercantil's quota is per IP / per key and shared by every endpoint
 * (anonymous: 60 requests per minute, 200 per day), so one global window caps
 * the whole server. Each tool also gets a smaller window so a single runaway
 * loop cannot starve the others.
 */
export function createServer(options: ServerOptions) {
  const { client, version, requestsPerMinute, maxResponseChars } = options;

  const rateLimiter = new RateLimiter({
    maxRequests: options.perToolRequestsPerMinute ?? 30,
    windowMs: 60000,
    toolLimits: {
      [GLOBAL_LIMIT_KEY]: { maxRequests: requestsPerMinute, windowMs: 60000 },
    },
  });

  const allTools = {
    ...getCompanyTools(client),
    ...getCompanySourceTools(client),
    ...getBulletinTools(client),
    ...getPersonTools(client),
    ...getSectorTools(client),
    ...getLegalTools(client),
    ...getTenderTools(client),
    ...getSystemTools(client),
  };

  const server = new Server(
    {
      name: 'mcp-borme',
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Object.entries(allTools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: toolTitle(name),
          readOnlyHint: 'readOnlyHint' in tool ? tool.readOnlyHint : false,
          // The tools reach an external service (OpenMercantil), not a closed local system.
          openWorldHint: true,
        },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = allTools[name as keyof typeof allTools];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    for (const key of [GLOBAL_LIMIT_KEY, name]) {
      const rateLimit = await rateLimiter.checkLimit(key);
      if (!rateLimit.allowed) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Rate limit exceeded',
                message: `Too many requests${
                  key === GLOBAL_LIMIT_KEY ? '' : ` for tool '${name}'`
                }. Please retry after ${rateLimit.retryAfter} seconds.`,
                retryAfter: rateLimit.retryAfter,
                resetTime: rateLimit.resetTime,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    try {
      const result = await tool.handler((args ?? {}) as never);
      return {
        content: [
          {
            type: 'text',
            text: serializeResult(result, maxResponseChars),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return { server, tools: allTools };
}
