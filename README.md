# MCP BORME

[![CI](https://github.com/nubiia-dev/mcp-borme/actions/workflows/ci.yml/badge.svg)](https://github.com/nubiia-dev/mcp-borme/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40nubiia%2Fmcp-borme.svg)](https://www.npmjs.com/package/@nubiia/mcp-borme)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![by Nubiia](https://img.shields.io/badge/by-Nubiia-6C4EE3)](https://nubiia.es)

A Model Context Protocol (MCP) server for the **BORME** (*Boletín Oficial del Registro
Mercantil*, Spain's commercial-registry bulletin), built on the public
[OpenMercantil](https://openmercantil.es) API. It lets AI assistants like Claude search
Spanish companies, read their registry history and officers, browse the daily bulletin,
map sectors by CNAE, look at public procurement and consult the mercantile-law norms behind
each registry act.

> Built and maintained by **[Nubiia](https://nubiia.es)** — automatización e
> integraciones con IA para negocios (MCP, Holded, Pipedrive y más). ¿Quieres algo así
> para tu empresa? Escríbenos en **[nubiia.es](https://nubiia.es)**.

> **Independent and informational.** OpenMercantil is not the BOE, the BORME or the
> Registro Mercantil, and its data does **not** replace official certificates or registry
> extracts. BORME material is re-used under Ley 37/2007; the official version is on
> [boe.es](https://www.boe.es/diario_borme/). Tool responses keep the source attribution
> (`_attributions`) and the tool descriptions repeat the documentary, not-legal-advice caveats.

## No account needed

The OpenMercantil API is **public**: this server works out of the box on its anonymous free
tier (**60 requests/minute and 200 requests/day per IP**). An optional API key
(`OPENMERCANTIL_API_KEY`, `omk_...`, from [openmercantil.es](https://openmercantil.es))
selects your account's larger quota:

| Plan | Per minute | Per day |
|---|---|---|
| Free (anonymous, per IP) | 60 | 200 |
| Profesional (API key) | 120 | 5,000 |
| MAX (API key) | 600 | 50,000 |
| Enterprise (contract) | 1,200 | 500,000+ |

Plans change — see [openmercantil.es](https://openmercantil.es) and
[`docs/api-notes.md`](docs/api-notes.md). With 200 requests a day, the server is built to
be frugal:

- Every input is **validated locally** against the OpenAPI bounds, so a bad call never
  costs a request.
- Result counts default to small numbers (10 results, 10 events, 10 acts per province) and
  big payloads are **trimmed with an explicit notice** (`events_total`, `events_truncated`,
  `total_acts`...) so the assistant knows what it did not see and which tool pages the rest.
  A full company report (~60 KB) arrives as ~6 KB; a full day of the bulletin (~340 KB) as
  a per-province summary.
- Any response above `OPENMERCANTIL_MAX_RESPONSE_CHARS` (default 60,000) is replaced by a
  valid-JSON envelope that says it was cut.
- Responses carry the API's rate-limit state; a `429` reports the plan, when to retry and
  how to get a larger quota. Short `Retry-After` values are honoured automatically; long
  ones (the daily quota) are reported immediately instead of blocking.

## Features

37 read-only tools, all marked `readOnlyHint: true` — nothing in this server writes to
OpenMercantil or anywhere else.

- **Companies** (11): `borme_search_companies`, `borme_get_company`,
  `borme_compare_companies`, `borme_get_company_events`, `borme_get_company_facts`,
  `borme_get_company_timeline`, `borme_get_company_officers`,
  `borme_get_company_relationships`, `borme_get_company_graph`,
  `borme_get_company_activity`, `borme_get_similar_companies`
- **Other public sources per company** (7): `borme_get_company_contracts`,
  `borme_get_company_grants`, `borme_get_company_ted`, `borme_get_company_cnmv`,
  `borme_get_company_wikidata`, `borme_get_company_bde`, `borme_get_company_sources`
- **Daily bulletin** (1): `borme_get_daily_summary`
- **Persons** (3): `borme_search_persons`, `borme_get_person`, `borme_get_person_graph`
- **Sectors / CNAE** (4): `borme_list_sector_companies`, `borme_get_sector_ratios`,
  `borme_get_cnae`, `borme_get_cnae_tree`
- **Mercantile law** (4): `borme_list_legal_norms`, `borme_get_legal_norm`,
  `borme_get_legal_article`, `borme_get_act_map`
- **Public procurement** (4): `borme_search_tenders`, `borme_get_tender`,
  `borme_get_tender_stats`, `borme_list_tender_suppliers`
- **Service** (3): `borme_get_health`, `borme_get_stats`, `borme_get_sources_freshness`

### Deliberately out of scope

Everything that is not part of OpenMercantil's public read plane: user accounts, lists,
notes, segments, API-credential and webhook management, billing, support tickets and the
legal-report purchase flow (all of them write data or need a browser session). Also left
out: the bulk `export/*` and CSV downloads, the legacy aliases, the aggregate dashboards
(`ccaa/stats`, `sectores/stats`, `datasets/public`, `integrations`) and the per-company
risk-signal endpoints (sanctions, embargoes, AEAT debtors, score), which are not part of
the allowlisted credential scopes of the public API.

## Installation

### Prerequisites

- Node.js 22.14 or higher
- Optionally, an OpenMercantil API key from **[openmercantil.es](https://openmercantil.es)**

### Install from npm

```bash
npm install -g @nubiia/mcp-borme
```

### Install from source

```bash
git clone https://github.com/nubiia-dev/mcp-borme.git
cd mcp-borme
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENMERCANTIL_API_KEY` | No | OpenMercantil API key (`omk_...`). Secret — never commit it. Without it the anonymous free tier is used. Sent in the `X-API-Key` header, never in a URL, and redacted from error messages. |
| `OPENMERCANTIL_MAX_REQUESTS_PER_MINUTE` | No | Local cap on requests per minute across all tools. Default **60** (the anonymous limit); raise it with a paid plan. |
| `OPENMERCANTIL_MAX_RESPONSE_CHARS` | No | Maximum size of one tool response. Default **60000**; larger results are cut with a notice. |
| `OPENMERCANTIL_BASE_URL` | No | Override the API host (mirrors, local mocks). `https` only, except `http://localhost`. |

```bash
export OPENMERCANTIL_API_KEY=omk_your_key   # optional
```

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "borme": {
      "command": "npx",
      "args": ["-y", "@nubiia/mcp-borme@latest"],
      "env": {
        "OPENMERCANTIL_API_KEY": "omk_your_key"
      }
    }
  }
}
```

Without a key, drop the `env` block entirely. Or if installed from source:

```json
{
  "mcpServers": {
    "borme": {
      "command": "node",
      "args": ["/path/to/mcp-borme/dist/index.js"]
    }
  }
}
```

### Claude Code Configuration

```bash
# anonymous free tier
claude mcp add borme -- npx -y @nubiia/mcp-borme@latest

# with an API key
claude mcp add borme --env OPENMERCANTIL_API_KEY=omk_your_key -- npx -y @nubiia/mcp-borme@latest
```

### Troubleshooting

- **`sh: mcp-borme: command not found` when launching from inside this repo.** If you
  start Claude Code (or another MCP client) from the cloned repository directory,
  `npx @nubiia/mcp-borme` resolves the local `package.json` instead of the published
  package, and the `mcp-borme` binary is not on the `PATH`. Pin the registry version
  with `@latest` (as in the examples above), or launch the client from another directory.
- **A recent date or company seems to be missing.** The OpenMercantil dataset is rebuilt
  periodically and can lag behind the official bulletin. Call `borme_get_health`
  (`latest_borme_processed`, `status`) to see how fresh it is.
- **`503 projection_unavailable` on grants / TED / CNMV / Wikidata / sources.** Those
  tools read an integrations projection that OpenMercantil can take offline; it is a
  server-side state, not evidence that the company has no such records.

## Tools

The recommended flow: **`borme_search_companies` → `borme_get_company` → detail tools.**
Company tools take the `slug` returned by the search (e.g. `telefonica-de-espana-sa`).

### `borme_search_companies` · read-only

Search by name prefix, alias or exact CIF. Returns slug, CIF, province, CNAE, share capital
(cents), first/last BORME appearance and number of acts. DNI/NIE never match.

```json
{ "q": "Telefónica de España", "limit": 5 }
```

### `borme_get_company` · read-only

The full BORME report: identity, KPIs, activity timeline, top event types, the most recent
events (`events_limit`, default 10; the response reports `events_total`) and current and
historical officers. Page the whole history with `borme_get_company_events`.

### `borme_get_company_events` · read-only

BORME acts of one company for a calendar year (`year`, default current), paginated
(`page`, `page_size` ≤ 100). Check `total` and `pages`.

```json
{ "slug": "telefonica-de-espana-sa", "year": 2025, "page_size": 20 }
```

### `borme_get_company_facts`, `borme_get_company_timeline`, `borme_get_company_officers`, `borme_get_company_relationships`, `borme_get_company_graph`, `borme_get_company_activity`, `borme_get_similar_companies`, `borme_compare_companies`

Structured facts per act type, a unified registry + procurement timeline, officers,
documentary relationships (filter by `type` / `confidence`), group graph, monthly activity
series, peers in the same province and CNAE division, and a two-company comparison. All
documentary: a mention is not proof of current status.

### `borme_get_company_contracts`, `_grants`, `_ted`, `_cnmv`, `_wikidata`, `_bde`, `_sources`

Public procurement (PLACSP), subsidies (BDNS), EU tenders (TED), stock-market listing
(CNMV), Wikidata identifiers, Banco de España sector ratios and the coverage map of those
sources. An empty result is not proof of absence.

### `borme_get_daily_summary` · read-only

What the BORME published on a date, by section and province. Because a day can hold
thousands of acts, the response gives **exact counts** plus the first `limit` acts per
province (default 10). Narrow with `province` / `section` (`"1"` registered acts, `"2"`
announcements). No bulletin is published on Sundays or holidays (404).

```json
{ "date": "2026-07-07", "province": "Madrid", "limit": 20 }
```

### `borme_search_persons`, `borme_get_person`, `borme_get_person_graph`

Persons appear **only as documentary name mentions** (usually officers). Homonyms share a
slug, identity is never resolved, and no DNI, address or contact data is exposed.

### `borme_list_sector_companies`, `borme_get_sector_ratios`, `borme_get_cnae`, `borme_get_cnae_tree`

Companies of a CNAE sector (optionally by province), Banco de España aggregate ratios per
two-digit division, code metadata and the code hierarchy.

### `borme_list_legal_norms`, `borme_get_legal_norm`, `borme_get_legal_article`, `borme_get_act_map`

The consolidated mercantile-law norms (BOE texts) and the bridge from each BORME act type to
the law that governs it. Informational only, not legal advice.

### `borme_search_tenders`, `borme_get_tender`, `borme_get_tender_stats`, `borme_list_tender_suppliers`

Public procurement notices with CPV / phase / province / buyer / supplier / amount / date
filters and cursor pagination. The API rejects some filter combinations (free text with
structured filters, `cpv` with anything but dates) with a `422` that is surfaced as-is.

### `borme_get_health`, `borme_get_stats`, `borme_get_sources_freshness`

Dataset size and **freshness** — worth checking before asserting that something "was not
published".

## Rate limiting

A local guard stops runaway agent loops before they burn the daily quota:

| Scope | Limit |
|---|---|
| All tools together | `OPENMERCANTIL_MAX_REQUESTS_PER_MINUTE` (default 60/min) |
| Each tool | 30 req/min |

`429`/`502`/`503`/`504` responses and connection-refused/DNS errors are retried with
backoff (3 attempts); timeouts and connection resets are not, to avoid wasting quota. Each
attempt times out after 30 seconds.

## Error messages

Errors say what to do: a `429` includes the plan, the retry time and the anonymous limits;
`401`/`403` point to `OPENMERCANTIL_API_KEY`; a `404` on a company or person explains that
OpenMercantil never confirms withheld or personal identities. The API key is redacted from
every error message.

## Development

```bash
npm install
npm run build
npm test              # runs entirely against mocks — no network, no API key
npm run test:coverage
npm run lint
node scripts/smoke.mjs   # live smoke test against the real API (about 10 requests)
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full workflow and
[`docs/api-notes.md`](docs/api-notes.md) for API behaviour verified against the live service.

## License

[MIT](LICENSE). The data served by OpenMercantil is subject to the source-specific terms
published in each response and at [openmercantil.es/terminos-de-uso](https://openmercantil.es/terminos-de-uso).

## Related

- [`@nubiia/mcp-newsapi`](https://github.com/nubiia-dev/mcp-newsapi) — MCP server for the
  NewsAPI.ai (Event Registry) news API.
- [`@nubiia/mcp-holded`](https://github.com/nubiia-dev/mcp-holded) — MCP server for the
  Holded invoicing/accounting API.
- [`@nubiia/mcp-signaturit`](https://github.com/nubiia-dev/mcp-signaturit) — MCP server
  for the Signaturit e-signature API.
