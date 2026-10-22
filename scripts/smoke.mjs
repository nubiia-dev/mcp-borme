#!/usr/bin/env node
/**
 * Live smoke test: starts the built server over stdio, lists the tools and
 * calls a handful of them against the real OpenMercantil API.
 *
 *   npm run build && node scripts/smoke.mjs
 *
 * Uses OPENMERCANTIL_API_KEY when set, otherwise the anonymous tier (200 req/day):
 * the script makes about ten calls. Not part of CI.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  env: { ...process.env },
  stderr: 'inherit',
});
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools/list: ${tools.length} tools`);
const bad = tools.filter((t) => !t.annotations?.readOnlyHint);
if (bad.length) throw new Error(`not read-only: ${bad.map((t) => t.name).join(', ')}`);

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  console.log(`\n--- ${name} ${JSON.stringify(args)} -> ${res.isError ? 'ERROR' : 'ok'} (${text.length} chars)`);
  console.log(text.slice(0, 400) + (text.length > 400 ? '…' : ''));
  return { isError: Boolean(res.isError), text };
}

const search = await call('borme_search_companies', { q: 'Telefónica de España', limit: 3 });
const slug = JSON.parse(search.text).items[0].slug;
const checks = [
  search,
  await call('borme_get_company', { slug, events_limit: 2 }),
  await call('borme_get_company_events', { slug, year: 2025, page_size: 2 }),
  await call('borme_get_daily_summary', { date: '2026-07-07', province: 'Madrid', limit: 2 }),
  await call('borme_search_persons', { q: 'garcia lopez', limit: 2 }),
  await call('borme_get_sector_ratios', { cnae: '62' }),
  await call('borme_get_legal_norm', { slug: 'codigo-de-comercio' }),
  await call('borme_get_health', {}),
  await call('borme_get_company', { slug: 'no-existe-xyz' }), // expected error path
];
// The last call is expected to fail with an explanatory 404.
const failures = checks.slice(0, -1).filter((c) => c.isError);
if (failures.length || !checks.at(-1).isError) {
  console.error('\nSMOKE FAILED');
  process.exit(1);
}
console.log('\nSMOKE OK');
await client.close();
