#!/usr/bin/env node
/**
 * Validates server.json against the MCP Registry JSON Schema that it declares in `$schema`.
 * The registry rejects a non-conforming file at publish time (e.g. a description over 100
 * characters), which is too late: this runs in CI so the failure shows up on the PR.
 *
 *   node scripts/validate-server-json.mjs
 */
import { readFileSync } from 'node:fs';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const server = JSON.parse(readFileSync('server.json', 'utf8'));
const schemaUrl = server.$schema;
if (typeof schemaUrl !== 'string' || !schemaUrl.startsWith('https://static.modelcontextprotocol.io/')) {
  console.error('server.json must declare a $schema on static.modelcontextprotocol.io');
  process.exit(1);
}

const response = await fetch(schemaUrl);
if (!response.ok) {
  console.error(`Could not download ${schemaUrl}: HTTP ${response.status}`);
  process.exit(1);
}
const schema = await response.json();

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(server)) {
  console.error(`server.json does not match ${schemaUrl}:`);
  for (const error of validate.errors) {
    console.error(`  ${error.instancePath || '/'} ${error.message}`);
  }
  process.exit(1);
}
console.log(`server.json is valid against ${schemaUrl}`);
