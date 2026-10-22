#!/usr/bin/env node

import { createRequire } from 'node:module';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  API_KEY_ENV,
  BASE_URL_ENV,
  MAX_CHARS_ENV,
  RPM_ENV,
  normalizeApiKey,
  parseBaseUrl,
  parseMaxResponseChars,
  parseRequestsPerMinute,
} from './utils/config.js';
import { OpenMercantilClient } from './openmercantil-client.js';
import { createServer } from './server.js';

// The version is read from package.json at runtime: hard-coded here it drifts as soon as
// semantic-release publishes, and MCP clients would see a number that does not match the
// installed package.
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// The API key is OPTIONAL: without it the server runs on OpenMercantil's anonymous free tier.
// Blank values and unsubstituted ${...} placeholders (MCPB hosts) count as "no key".
const apiKey = normalizeApiKey(process.env[API_KEY_ENV]);
if (apiKey && !apiKey.startsWith('omk_')) {
  console.error(`Warning: ${API_KEY_ENV} does not look like an OpenMercantil key (omk_...).`);
}

const rpm = parseRequestsPerMinute(process.env[RPM_ENV]);
const maxChars = parseMaxResponseChars(process.env[MAX_CHARS_ENV]);
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

const { server, tools } = createServer({
  client,
  version,
  requestsPerMinute: rpm.value,
  maxResponseChars: maxChars.value,
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `OpenMercantil BORME MCP Server ${version} running on stdio ` +
      `(${client.authenticated ? 'API key configured' : 'anonymous free tier'}, ` +
      `${Object.keys(tools).length} tools)`
  );
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
