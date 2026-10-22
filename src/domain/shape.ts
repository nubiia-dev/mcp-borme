/**
 * Response shaping for OpenMercantil payloads.
 *
 * Raw responses are written for web pages, not for an LLM context window: a
 * company report with 200 BORME acts is ~60 KB and one daily summary is
 * ~340 KB. These helpers drop transport boilerplate and bound the large
 * collections, always reporting how much was left out so the assistant can
 * ask for more through the paginated tools.
 */

type JsonObject = Record<string, unknown>;

/** Top-level keys that only carry licence boilerplate repeated on every response (~1.5 KB each). */
const BOILERPLATE_KEYS = ['_source_catalog', '_data_sources_used'] as const;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Removes the repeated licence catalogue from a response.
 *
 * `_attributions` is deliberately KEPT: BORME re-use requires attribution
 * (the API sends `X-Attribution-Required`), and a downstream assistant should
 * be able to cite it.
 */
export function cleanResponse<T>(raw: T): T {
  if (!isObject(raw)) return raw;
  const copy: JsonObject = { ...raw };
  for (const key of BOILERPLATE_KEYS) delete copy[key];
  return copy as T;
}

/**
 * Keeps the first `limit` entries of `obj[key]` (when it is an array) and
 * records `<key>_total` / `<key>_truncated` next to it. A no-op when the key
 * is missing or not an array, so shape drift upstream never throws.
 */
export function limitArray(obj: JsonObject, key: string, limit: number): JsonObject {
  const value = obj[key];
  if (!Array.isArray(value)) return obj;
  return {
    ...obj,
    [key]: value.slice(0, limit),
    [`${key}_total`]: value.length,
    [`${key}_truncated`]: value.length > limit,
  };
}

/**
 * Bounds the `events` list of `GET /company/{slug}` (newest first). The full
 * history is available, paginated, through `borme_get_company_events`.
 */
export function trimCompanyReport(raw: unknown, eventsLimit: number): unknown {
  const cleaned = cleanResponse(raw);
  if (!isObject(cleaned)) return cleaned;
  const trimmed = limitArray(cleaned, 'events', eventsLimit);
  return trimmed.events_truncated
    ? {
        ...trimmed,
        events_note:
          'Only the most recent events are included. Use borme_get_company_events to page through the full BORME history.',
      }
    : trimmed;
}

/** Lower-cases and strips diacritics so "Málaga" matches "malaga". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Picks the provinces that match a folded query: exact (accent/case-insensitive)
 * first; if none, any whose name contains the query, so "alava" finds "Araba/Álava".
 */
function matchProvinces(names: string[], folded: string): Set<string> {
  const exact = names.filter((name) => fold(name) === folded);
  if (exact.length > 0) return new Set(exact);
  return new Set(names.filter((name) => fold(name).includes(folded)));
}

export interface DailyOptions {
  /** Keep only provinces matching this name (accent/case-insensitive; exact first, then substring). */
  province?: string;
  /** BORME section: "1" (Sección Primera, actos inscritos) or "2" (Sección Segunda, anuncios y avisos). */
  section?: string;
  /** Maximum acts returned per province. */
  limit: number;
}

/**
 * Condenses `GET /daily/{date}`: `{ date, sections: { "<section>": { "<province>": Act[] } } }`.
 *
 * Returns per-province counts for everything that matched plus the first
 * `limit` acts of each province, so "what was published in Madrid on this
 * date" fits in context. Filters narrow both the counts and the acts.
 */
export function summarizeDaily(raw: unknown, options: DailyOptions): unknown {
  const cleaned = cleanResponse(raw);
  if (!isObject(cleaned) || !isObject(cleaned.sections)) return cleaned;

  const wantedProvince = options.province ? fold(options.province) : undefined;
  const available = new Set<string>();
  for (const [section, provinces] of Object.entries(cleaned.sections)) {
    if (options.section && section !== options.section) continue;
    if (isObject(provinces)) Object.keys(provinces).forEach((name) => available.add(name));
  }
  const matches = wantedProvince ? matchProvinces([...available], wantedProvince) : undefined;
  const counts: Record<string, Record<string, number>> = {};
  const sections: Record<string, Record<string, unknown[]>> = {};
  let totalActs = 0;
  let returnedActs = 0;

  for (const [section, provinces] of Object.entries(cleaned.sections)) {
    if (options.section && section !== options.section) continue;
    if (!isObject(provinces)) continue;
    for (const [province, acts] of Object.entries(provinces)) {
      if (matches && !matches.has(province)) continue;
      if (!Array.isArray(acts)) continue;
      (counts[section] ??= {})[province] = acts.length;
      totalActs += acts.length;
      const kept = acts.slice(0, options.limit);
      returnedActs += kept.length;
      (sections[section] ??= {})[province] = kept;
    }
  }

  const { sections: _omit, ...rest } = cleaned;
  void _omit;
  const noProvinceMatch = Boolean(wantedProvince) && matches?.size === 0;
  return {
    ...rest,
    total_acts: totalActs,
    returned_acts: returnedActs,
    truncated: returnedActs < totalActs,
    counts_by_section_and_province: counts,
    sections,
    ...(noProvinceMatch
      ? {
          note:
            `No province matches "${options.province}" in this bulletin (it may simply have no ` +
            `acts that day). Pick one of available_provinces.`,
          available_provinces: [...available].sort((a, b) => a.localeCompare(b, 'es')),
        }
      : {}),
    ...(returnedActs < totalActs
      ? {
          note:
            `Showing at most ${options.limit} acts per province. Narrow with province/section, ` +
            `raise limit, or use borme_get_company_events for one company.`,
        }
      : {}),
  };
}
