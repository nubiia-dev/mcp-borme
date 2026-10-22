# OpenMercantil API notes

Behaviour observed while building this server (October 2026), from the OpenAPI document at
<https://openmercantil.es/openapi.json> (v1.9.3) and exercised against the live service.
Everything marked **verified** was called for real.

## Transport

- Host `https://openmercantil.es`, paths under `/api/v1/`. Every tool uses a plain `GET`.
- Auth is **optional**. Anonymous calls are served on the free tier. An opaque `omk_*`
  credential goes in `X-API-Key` (or `Authorization: Bearer`), never in a query string.
  This server uses `X-API-Key` only.
- Rate limits: Free 60/min and 200/day per IP; Profesional 120/min, 5,000/day; MAX
  600/min, 50,000/day; Enterprise 1,200/min, 500,000+/day. Responses carry
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-OpenMercantil-Plan`
  and, on 429, `Retry-After`.
- `X-Attribution-Required: borme` — BORME attribution is mandatory; response bodies carry
  `_attributions`, which this server keeps.
- Errors are JSON: `{"error": "<code>", "detail": "<text>", ...}`. 404 for a company/person
  is deliberately neutral (absent, personal, ambiguous and withheld look the same).
- `If-None-Match`/ETag are supported but not used: the server does not cache.

## Endpoints used

| Tool | Endpoint | Status |
|---|---|---|
| `borme_search_companies` | `/search` | verified |
| `borme_get_company` | `/company/{slug}` | verified |
| `borme_compare_companies` | `/companies/compare?slugs=a,b` | verified |
| `borme_get_company_events` | `/company/{slug}/events` | verified |
| `borme_get_company_facts` | `/empresa/{slug}/facts` | verified |
| `borme_get_company_timeline` | `/company/{slug}/timeline` | verified |
| `borme_get_company_officers` | `/company/{slug}/officers` | verified |
| `borme_get_company_relationships` | `/company/{slug}/relationships` | verified |
| `borme_get_company_graph` | `/grafo/{slug}` | verified |
| `borme_get_company_activity` | `/company/{slug}/activity` | verified |
| `borme_get_similar_companies` | `/company/{slug}/similar` | verified |
| `borme_get_company_contracts` | `/company/{slug}/contracts` | verified |
| `borme_get_company_grants` | `/company/{slug}/grants` | 503 live (see below) |
| `borme_get_company_ted` | `/company/{slug}/ted` | 503 live |
| `borme_get_company_cnmv` | `/company/{slug}/cnmv` | 503 live |
| `borme_get_company_wikidata` | `/company/{slug}/wikidata` | 503 live |
| `borme_get_company_bde` | `/company/{slug}/bde` | verified |
| `borme_get_company_sources` | `/company/{slug}/sources` | 503 live |
| `borme_get_daily_summary` | `/daily/{date}` | verified |
| `borme_search_persons` | `/person/search` | verified |
| `borme_get_person` | `/persona/{slug}` | verified |
| `borme_get_person_graph` | `/grafo/persona/{slug}` | verified |
| `borme_list_sector_companies` | `/sector/{cnae}/companies` | verified |
| `borme_get_sector_ratios` | `/sector/{cnae}/ratios` | verified |
| `borme_get_cnae` | `/cnae/{code}` | verified |
| `borme_get_cnae_tree` | `/cnae/tree` | verified |
| `borme_list_legal_norms` | `/legal/norms` | verified |
| `borme_get_legal_norm` | `/legal/norm/{slug}` | verified |
| `borme_get_legal_article` | `/legal/article/{norm}/{n}` | verified (404 for unseeded articles) |
| `borme_get_act_map` | `/legal/act-map` and `/legal/act-map/{acto}` | verified |
| `borme_search_tenders` | `/tenders` | verified |
| `borme_get_tender` | `/tenders/{key}` | verified |
| `borme_get_tender_stats` | `/tenders/stats` | verified |
| `borme_list_tender_suppliers` | `/tenders/suppliers` | verified |
| `borme_get_health` | `/health` | verified |
| `borme_get_stats` | `/stats` | verified |
| `borme_get_sources_freshness` | `/sources/freshness` | verified |

Only operations that declare an `x-api-credential-scope` in the OpenAPI document were
considered (the public read plane). Operations without one are legacy aliases, CSV/bulk
exports, per-company risk signals, account/billing/support routes or write operations.

## Payload sizes (why responses are trimmed)

| Call | Raw size | Handling |
|---|---|---|
| `/company/{slug}` (201 acts) | ~64 KB, 60 KB of it `events` | `events` cut to `events_limit` (default 10) |
| `/daily/{date}` | ~340 KB | per-province counts + first `limit` acts (default 10) |
| `/company/{slug}/timeline` | ~24 KB | `events` cut to `limit` (default 30) |
| `/company/{slug}/contracts?limit=3` | ~9 KB | default `limit` 10 |
| every response | ~1.5 KB | `_source_catalog` and `_data_sources_used` dropped; `_attributions` kept |

## Quirks

- `/daily/{date}` answers 404 on Sundays and holidays (no bulletin). The body's `date` is
  `YYYYMMDD`, unlike the `YYYY-MM-DD` path parameter.
- `/cnae/{code}` knows section letters and two-digit divisions; a four-digit code such as
  `6201` answered 404 (verified).
- `/sector/{cnae}/companies` accepts `sort=recent|oldest` only together with `province`.
- `/tenders`: free text cannot be combined with structured filters, and `cpv` combines only
  with the publication dates (422 otherwise). Amount bounds need `amount_kind`.
- `/search` needs at least 2 characters (422 otherwise); name matching is by prefix.
- Several company integration routes (`grants`, `ted`, `cnmv`, `wikidata`, `sources`)
  answered `503 {"error":"projection_unavailable"}` during testing: the integrations
  projection was offline. This is a server state, not "no data".
- `/health` reported `status: "stale"` with `latest_borme_processed: 2026-08-21` on
  2026-10-22: the dataset can lag the official bulletin by weeks. Hence the
  `borme_get_health` tool and the hints in the tool descriptions.
