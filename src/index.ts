#!/usr/bin/env node

import { createRequire } from 'node:module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { RateLimiter } from './utils/rate-limiter.js';
import {
  API_KEY_ENV,
  BASE_URL_ENV,
  parseBaseUrl,
  parseMaxResponseChars,
  parseRequestsPerMinute,
  serializeResult,
} from './utils/config.js';
import { OpenMercantilClient } from './openmercantil-client.js';
import { getCompanyTools } from './tools/companies.js';
import { getCompanySourceTools } from './tools/company-sources.js';
import { getBulletinTools } from './tools/bulletin.js';
import { getPersonTools } from './tools/persons.js';
import { getSectorTools } from './tools/sectors.js';
import { getLegalTools } from './tools/legal.js';
import { getTenderTools } from './tools/tenders.js';
import { getSystemTools } from './tools/system.js';

// The version is read from package.json at runtime: hard-coded here it drifts as soon as
// semantic-release publishes, and MCP clients would see a number that does not match the
// installed package.
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// The API key is OPTIONAL: without it the server runs on OpenMercantil's anonymous free tier.
const apiKey = process.env[API_KEY_ENV] ?? '';
if (apiKey && !apiKey.trim().startsWith('omk_')) {
  console.error(`Warning: ${API_KEY_ENV} does not look like an OpenMercantil key (omk_...).`);
}

const rpm = parseRequestsPerMinute(process.env.OPENMERCANTIL_MAX_REQUESTS_PER_MINUTE);
const maxChars = parseMaxResponseChars(process.env.OPENMERCANTIL_MAX_RESPONSE_CHARS);
for (const parsed of [rpm, maxChars]) {
  if (parsed.warning) console.error(`Warning: ${parsed.warning}`);
}

let client: OpenMercantilClient;
try {
  client = new OpenMercantilClient(apiKey, { host: parseBaseUrl(process.env[BASE_URL_ENV]) });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/**
 * OpenMercantil's quota is per IP / per key and shared by every endpoint
 * (anonymous: 60 requests per minute, 200 per day), so one global window caps
 * the whole server. Each tool also gets a smaller window so a single runaway
 * loop cannot starve the others.
 */
const GLOBAL_LIMIT_KEY = '__all_tools__';
const rateLimiter = new RateLimiter({
  maxRequests: 30, // default per tool: 30 requests/min
  windowMs: 60000,
  toolLimits: {
    [GLOBAL_LIMIT_KEY]: { maxRequests: rpm.value, windowMs: 60000 },
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
      annotations: { readOnlyHint: 'readOnlyHint' in tool ? tool.readOnlyHint : false },
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
          text: serializeResult(result, maxChars.value),
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `OpenMercantil BORME MCP Server ${version} running on stdio ` +
      `(${client.authenticated ? 'API key configured' : 'anonymous free tier'}, ` +
      `${Object.keys(allTools).length} tools)`
  );
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
