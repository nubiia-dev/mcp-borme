#!/usr/bin/env node
/**
 * Validates server.json against the MCP Registry JSON Schema that it declares in `$schema`.
 * The registry rejects a non-conforming file at publish time (e.g. a description over 100
 * characters), which is too late: this runs in CI so the failure shows up on the PR.
 *
 *   node scripts/validate-server-json.mjs [path/to/server.json]
 *
 * The schema is downloaded (10 s timeout, 3 attempts with backoff). Exit codes:
 *   0  valid, or valid against the bundled copy when the network is unavailable
 *      (in which case a `::warning::` annotation is printed)
 *   1  server.json does not match the schema, or the schema URL answers HTTP 4xx
 *      (it moved or was removed: update `$schema` and the bundled copy)
 *
 * A network failure never fails the check on its own, but a validation failure always does.
 *
 * Test-only environment override: VALIDATE_SERVER_SCHEMA_URL replaces the download URL
 * (e.g. an unreachable address, to exercise the offline fallback).
 */
import { readFileSync } from 'node:fs';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const FETCH_TIMEOUT_MS = 10_000;
const ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];

/** Schemas bundled in the repo, keyed by the URL that server.json declares in `$schema`. */
const BUNDLED = new Map([
  [
    'https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json',
    new URL('./schemas/server.schema.2025-10-17.json', import.meta.url),
  ],
]);

const serverPath = process.argv[2] ?? 'server.json';
const server = JSON.parse(readFileSync(serverPath, 'utf8'));
const schemaUrl = server.$schema;
if (
  typeof schemaUrl !== 'string' ||
  !schemaUrl.startsWith('https://static.modelcontextprotocol.io/')
) {
  console.error(`${serverPath} must declare a $schema on static.modelcontextprotocol.io`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Downloads the schema.
 * @returns {Promise<{schema?: object, fatal?: string, networkError?: string}>}
 *   `fatal` for a definitive HTTP 4xx, `networkError` when every attempt failed transiently.
 */
async function downloadSchema(url) {
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok) return { schema: await response.json() };
      if (response.status >= 400 && response.status < 500) {
        return {
          fatal:
            `Schema URL ${url} answered HTTP ${response.status}. The schema was probably moved ` +
            `or removed: update "$schema" in ${serverPath} and the copy in scripts/schemas/.`,
        };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    if (attempt < ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1]);
  }
  return { networkError: lastError };
}

const downloadUrl = process.env.VALIDATE_SERVER_SCHEMA_URL ?? schemaUrl;
const downloaded = await downloadSchema(downloadUrl);

if (downloaded.fatal) {
  console.error(downloaded.fatal);
  process.exit(1);
}

let schema = downloaded.schema;
let source = downloadUrl;
if (!schema) {
  const bundled = BUNDLED.get(schemaUrl);
  if (!bundled) {
    console.error(
      `Could not download ${downloadUrl} (${downloaded.networkError}) and there is no bundled ` +
        `copy of ${schemaUrl}.`
    );
    process.exit(1);
  }
  schema = JSON.parse(readFileSync(bundled, 'utf8'));
  source = `bundled copy ${bundled.pathname.split('/').slice(-2).join('/')}`;
  console.log(
    `::warning title=MCP schema unreachable::Could not download ${downloadUrl} ` +
      `(${downloaded.networkError}); validated against the ${source} instead.`
  );
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(server)) {
  console.error(`${serverPath} does not match the MCP Registry schema (${source}):`);
  for (const error of validate.errors) {
    console.error(`  ${error.instancePath || '/'} ${error.message}`);
  }
  process.exit(1);
}
console.log(`${serverPath} is valid against ${source}`);
