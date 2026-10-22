import { z } from 'zod';

/**
 * Shared validation schemas for all OpenMercantil MCP tools.
 *
 * Tool inputs use snake_case and mirror the OpenAPI contract
 * (https://openmercantil.es/openapi.json) so that out-of-range values fail
 * locally with an explanation instead of costing a request (the anonymous
 * tier allows only 200 requests per day). Result-count defaults are
 * deliberately smaller than the API's own defaults: long lists also burn the
 * calling agent's context window.
 *
 * Each schema doubles as the source of the tool's JSON Schema (see
 * `tools/define.ts`), so descriptions written with `.describe()` are what the
 * model sees.
 */

/**
 * Parses a `YYYY-MM-DD` string into a UTC midnight timestamp, or `undefined`
 * when it is not a real calendar date (the regex alone would accept 2026-13-45).
 */
export function parseIsoDate(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return undefined;
  // Date.parse rolls invalid days over in some engines (e.g. 2026-02-30); round-trip to catch that.
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : undefined;
}

/** `YYYY-MM-DD` calendar date. */
const isoDate = z
  .string()
  .refine((v) => parseIsoDate(v) !== undefined, 'must be a real date in YYYY-MM-DD format');

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Company slug as returned by `borme_search_companies` (lower-case, hyphen separated). */
const companySlug = z
  .string()
  .max(240)
  .regex(SLUG_PATTERN, 'must be a slug such as "telefonica-de-espana-sa" (lower-case, hyphens)')
  .describe(
    'Company slug, e.g. "telefonica-de-espana-sa". Get it from borme_search_companies (field `slug`).'
  );

/** Person slug as returned by `borme_search_persons`. */
const personSlug = z
  .string()
  .max(240)
  .regex(SLUG_PATTERN, 'must be a slug such as "garcia-lopez-eduardo" (lower-case, hyphens)')
  .describe('Person slug, e.g. "garcia-lopez-eduardo". Get it from borme_search_persons.');

const cnaeCode = z
  .string()
  .regex(/^[0-9A-Z]{1,4}$/, 'must be 1-4 characters: digits or an uppercase CNAE section letter')
  .describe(
    'CNAE-2009 code: a section letter (e.g. "J"), a 2-digit division (e.g. "62") or a longer numeric code.'
  );

const corporateId = z
  .string()
  .regex(
    /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/,
    'must be a corporate CIF/NIF in upper case, e.g. A82018474'
  );

/** Integer in [min, max] with a default. */
function intRange(min: number, max: number, def: number, description: string) {
  return z.number().int().min(min).max(max).optional().default(def).describe(description);
}

export const searchCompaniesSchema = z.object({
  q: z
    .string()
    .min(2)
    .max(120)
    .describe(
      'Company name (or the start of it), alias or exact CIF, e.g. "Telefónica de España" or "A82018474". ' +
        'Natural-person identifiers (DNI/NIE) always return zero results.'
    ),
  limit: intRange(1, 100, 10, 'Results to return, 1-100 (default 10).'),
  offset: intRange(0, 1000, 0, 'Pagination offset, 0-1000 (default 0).'),
});

export const getCompanySchema = z.object({
  slug: companySlug,
  events_limit: intRange(
    0,
    200,
    10,
    'How many of the most recent BORME events to include, 0-200 (default 10; 0 = none). ' +
      'The full history is paginated by borme_get_company_events.'
  ),
});

export const compareCompaniesSchema = z
  .object({
    slugs: z
      .array(companySlug)
      .length(2)
      .describe(
        'Exactly two distinct company slugs to compare, e.g. ["empresa-a-sl","empresa-b-sl"].'
      ),
  })
  .superRefine((v, ctx) => {
    if (v.slugs[0] === v.slugs[1]) {
      ctx.addIssue({ code: 'custom', path: ['slugs'], message: 'the two slugs must be different' });
    }
  });

/** Current UTC year, evaluated per call so a long-running server never goes stale. */
function currentUtcYear(): number {
  return new Date().getUTCFullYear();
}

export const getCompanyEventsSchema = z
  .object({
    slug: companySlug,
    year: z
      .number()
      .int()
      .min(1900)
      .optional()
      .describe(
        'Calendar year to list (1900 up to the current year). Defaults to the current year.'
      ),
    page: intRange(1, 1000, 1, 'Page number, starting at 1 (default 1).'),
    page_size: intRange(1, 100, 20, 'Events per page, 1-100 (default 20).'),
  })
  .superRefine((v, ctx) => {
    if (v.year !== undefined && v.year > currentUtcYear()) {
      ctx.addIssue({
        code: 'custom',
        path: ['year'],
        message: `year must not be later than the current year (${currentUtcYear()})`,
      });
    }
  });

export const getCompanyFactsSchema = z.object({
  slug: companySlug,
  limit: intRange(1, 200, 20, 'Facts to return, 1-200 (default 20).'),
});

export const getCompanyTimelineSchema = z.object({
  slug: companySlug,
  limit: intRange(
    1,
    200,
    30,
    'Most recent timeline entries to return, 1-200 (default 30). The API returns the whole timeline; this bounds it for context.'
  ),
});

export const companySlugOnlySchema = z.object({ slug: companySlug });

export const getCompanyRelationshipsSchema = z.object({
  slug: companySlug,
  type: z
    .enum(['officer', 'domicile', 'contract', 'grant', 'ip', 'corporate', 'mention'])
    .optional()
    .describe('Only relationships of this type.'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .optional()
    .describe('Only relationships with this confidence level.'),
});

export const getCompanyGraphSchema = z.object({
  slug: companySlug,
  max_children: intRange(1, 100, 10, 'Maximum child entities returned, 1-100 (default 10).'),
});

export const getSimilarCompaniesSchema = z.object({
  slug: companySlug,
  limit: intRange(1, 20, 8, 'Similar companies to return, 1-20 (default 8).'),
});

export const getCompanyContractsSchema = z.object({
  slug: companySlug,
  limit: intRange(1, 100, 10, 'Procurement notices to return, 1-100 (default 10).'),
});

export const getCompanyGrantsSchema = z.object({
  slug: companySlug,
  limit: intRange(1, 200, 20, 'BDNS grants to return, 1-200 (default 20).'),
});

export const getCompanyTedSchema = z.object({
  slug: companySlug,
  limit: intRange(1, 100, 20, 'TED notices to return, 1-100 (default 20).'),
});

export const getCompanyCnmvSchema = z.object({
  slug: companySlug,
  limit: intRange(1, 20, 5, 'CNMV events to return, 1-20 (default 5).'),
});

export const getDailySummarySchema = z.object({
  date: isoDate.describe(
    'Publication date, YYYY-MM-DD. BORME is not published on Sundays or national holidays (those dates return 404).'
  ),
  province: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe(
      'Only this province, e.g. "Madrid" or "Málaga". Case/accent-insensitive; a partial name works ("alava" finds "Araba/Álava"). If nothing matches, the response lists available_provinces.'
    ),
  section: z
    .enum(['1', '2'])
    .optional()
    .describe(
      'BORME section: "1" = Sección Primera (registered acts: constitutions, appointments, capital...), ' +
        '"2" = Sección Segunda (announcements and notices). Default: both.'
    ),
  limit: intRange(
    1,
    200,
    10,
    'Maximum acts returned per province, 1-200 (default 10). Counts always cover everything.'
  ),
});

export const searchPersonsSchema = z.object({
  q: z
    .string()
    .min(2)
    .max(200)
    .describe(
      'Person name as written in the BORME, e.g. "Garcia Lopez Eduardo". Results are unresolved name ' +
        'mentions (homonyms are possible), not identity profiles.'
    ),
  limit: intRange(1, 50, 10, 'Results to return, 1-50 (default 10).'),
});

export const getPersonSchema = z.object({ slug: personSlug });

export const getPersonGraphSchema = z.object({
  slug: personSlug,
  limit: intRange(1, 50, 10, 'Companies to return, 1-50 (default 10).'),
});

const SECTOR_SORTS = ['acts', 'recent', 'oldest', 'name'] as const;

export const listSectorCompaniesSchema = z
  .object({
    cnae: cnaeCode,
    limit: intRange(1, 100, 20, 'Results to return, 1-100 (default 20).'),
    offset: intRange(0, 1000, 0, 'Pagination offset, 0-1000 (default 0).'),
    sort: z
      .enum(SECTOR_SORTS)
      .optional()
      .describe(
        'Order: acts (most BORME activity, default without province), recent, oldest, name. ' +
          'With `province` only recent (default) and oldest are accepted.'
      ),
    province: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('Restrict to a province, e.g. "Madrid".'),
  })
  .superRefine((v, ctx) => {
    if (v.province && v.sort && v.sort !== 'recent' && v.sort !== 'oldest') {
      ctx.addIssue({
        code: 'custom',
        path: ['sort'],
        message: 'with province only sort=recent or sort=oldest are accepted',
      });
    }
  });

export const getSectorRatiosSchema = z.object({
  cnae: z
    .string()
    .regex(/^[0-9]{2}$/, 'must be an exact two-digit CNAE division such as "62"')
    .describe('Two-digit CNAE division, e.g. "62" (programming and IT consulting).'),
});

export const getCnaeSchema = z.object({ code: cnaeCode });

export const emptySchema = z.object({});

const NORM_SLUG = /^[a-z0-9-]+$/;

export const getLegalNormSchema = z.object({
  slug: z
    .string()
    .regex(NORM_SLUG, 'must be a norm slug as listed by borme_list_legal_norms')
    .describe('Norm slug, e.g. "codigo-de-comercio". Get it from borme_list_legal_norms.'),
});

export const getLegalArticleSchema = z.object({
  norm: z
    .string()
    .regex(NORM_SLUG, 'must be a norm slug as listed by borme_list_legal_norms')
    .describe('Norm slug, e.g. "codigo-de-comercio".'),
  n: z
    .string()
    .regex(
      /^[0-9][0-9a-z\-.]*$/,
      'must start with a digit and may add a bis/ter suffix joined by a hyphen, e.g. "160-bis"'
    )
    .refine((v) => !v.includes('..'), 'must not contain ".."')
    .describe('Article number; a bis/ter suffix is joined with a hyphen, e.g. "160-bis".'),
});

export const getActMapSchema = z.object({
  acto: z
    .string()
    .regex(NORM_SLUG, 'must be a BORME act-type slug as listed in the full act map')
    .optional()
    .describe(
      'BORME act-type slug to look up one mapping. Omit to get the full act-type to norm map.'
    ),
});

export const searchTendersSchema = z
  .object({
    q: z
      .string()
      .min(3)
      .max(200)
      .optional()
      .describe('Terms in the notice object or buyer name (supplier names are NOT searched).'),
    cpv: z
      .string()
      .regex(/^[0-9]{2,8}$/, 'must be a 2-8 digit CPV prefix')
      .optional()
      .describe(
        'CPV code prefix, 2-8 digits (e.g. "72" for IT services). Combines only with the date filters.'
      ),
    phase: z
      .enum(['PUB', 'PRE', 'EV', 'ADJ', 'RES', 'ANUL'])
      .optional()
      .describe(
        'Notice phase: PUB published, PRE prior notice, EV evaluation, ADJ awarded, RES resolved, ANUL annulled.'
      ),
    province: z
      .string()
      .regex(SLUG_PATTERN, 'must be a province slug such as "madrid" or "santa-cruz-de-tenerife"')
      .optional()
      .describe('Province slug, e.g. "madrid". Rows not yet geocoded are excluded.'),
    buyer_nif: corporateId
      .optional()
      .describe('NIF of the contracting body (corporate identifiers only).'),
    supplier_cif: corporateId
      .optional()
      .describe('CIF of the awarded supplier (corporate identifiers only).'),
    open_only: z.boolean().optional().describe('Only notices still open for bids.'),
    amount_kind: z
      .enum(['budget', 'estimated', 'award'])
      .optional()
      .describe(
        'Which monetary concept min_amount_eur/max_amount_eur refer to. Required with either bound.'
      ),
    min_amount_eur: z
      .number()
      .min(0)
      .max(10_000_000_000)
      .optional()
      .describe('Minimum amount in EUR.'),
    max_amount_eur: z
      .number()
      .min(0)
      .max(10_000_000_000)
      .optional()
      .describe('Maximum amount in EUR.'),
    published_from: isoDate.optional().describe('Earliest publication date, YYYY-MM-DD.'),
    published_to: isoDate.optional().describe('Latest publication date, YYYY-MM-DD.'),
    limit: intRange(1, 50, 10, 'Notices per page, 1-50 (default 10).'),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,256}$/, 'must be the opaque cursor returned by the previous page')
      .optional()
      .describe(
        'Opaque cursor from the previous response to get the next page. Invalid if any filter changes.'
      ),
  })
  .superRefine((v, ctx) => {
    if ((v.min_amount_eur !== undefined || v.max_amount_eur !== undefined) && !v.amount_kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount_kind'],
        message: 'amount_kind is required when min_amount_eur or max_amount_eur is used',
      });
    }
    if (
      v.min_amount_eur !== undefined &&
      v.max_amount_eur !== undefined &&
      v.max_amount_eur < v.min_amount_eur
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['max_amount_eur'],
        message: 'max_amount_eur must be >= min_amount_eur',
      });
    }
    const from = v.published_from !== undefined ? parseIsoDate(v.published_from) : undefined;
    const to = v.published_to !== undefined ? parseIsoDate(v.published_to) : undefined;
    if (from !== undefined && to !== undefined && to < from) {
      ctx.addIssue({
        code: 'custom',
        path: ['published_to'],
        message: 'published_to must be on or after published_from',
      });
    }
  });

export const getTenderSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9]{6,48}$/, 'must be a notice key as returned by borme_search_tenders')
    .describe('Notice `key` (stable url_key) from borme_search_tenders, e.g. "81e28810c6b3502a".'),
});

export const listTenderSuppliersSchema = z.object({
  limit: intRange(1, 50, 10, 'Suppliers to return, 1-50 (default 10).'),
});

/**
 * Validation utility function
 */
export function validateInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      throw new Error(`Validation error: ${formattedErrors}`);
    }
    throw error;
  }
}

/**
 * Wraps a handler so its arguments are validated (and defaults applied)
 * before it runs.
 */
export function withValidation<TInput, TOutput>(
  schema: z.ZodType<TInput>,
  handler: (args: TInput) => Promise<TOutput>
) {
  return async (args: unknown): Promise<TOutput> => {
    const validatedArgs = validateInput(schema, args);
    return handler(validatedArgs);
  };
}
