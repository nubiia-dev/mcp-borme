import { describe, it, expect } from 'vitest';
import {
  compareCompaniesSchema,
  getActMapSchema,
  getCompanyEventsSchema,
  getCompanySchema,
  getDailySummarySchema,
  getLegalArticleSchema,
  getSectorRatiosSchema,
  listSectorCompaniesSchema,
  parseIsoDate,
  searchCompaniesSchema,
  searchTendersSchema,
  validateInput,
} from '../validation.js';

describe('parseIsoDate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(parseIsoDate('2026-07-07')).toBe(Date.UTC(2026, 6, 7));
    expect(parseIsoDate('2026-02-30')).toBeUndefined();
    expect(parseIsoDate('2026-13-01')).toBeUndefined();
    expect(parseIsoDate('07/07/2026')).toBeUndefined();
  });
});

describe('searchCompaniesSchema', () => {
  it('applies the small-context defaults', () => {
    expect(validateInput(searchCompaniesSchema, { q: 'telefonica' })).toEqual({
      q: 'telefonica',
      limit: 10,
      offset: 0,
    });
  });

  it('enforces the API bounds locally', () => {
    expect(() => validateInput(searchCompaniesSchema, { q: 'a' })).toThrow(/q:/);
    expect(() => validateInput(searchCompaniesSchema, { q: 'ab', limit: 101 })).toThrow(/limit/);
    expect(() => validateInput(searchCompaniesSchema, { q: 'ab', offset: 1001 })).toThrow(/offset/);
    expect(() => validateInput(searchCompaniesSchema, { q: 'x'.repeat(121) })).toThrow(/q:/);
  });
});

describe('slug validation', () => {
  it.each(['../etc/passwd', 'Telefonica', 'a b', 'a--b', '-a', 'a/b', ''])(
    'rejects the malformed slug %j',
    (slug) => {
      expect(() => validateInput(getCompanySchema, { slug })).toThrow(/slug/);
    }
  );

  it('accepts a normal slug', () => {
    expect(validateInput(getCompanySchema, { slug: 'telefonica-de-espana-sa' }).events_limit).toBe(
      10
    );
  });
});

describe('compareCompaniesSchema', () => {
  it('requires exactly two distinct slugs', () => {
    expect(() => validateInput(compareCompaniesSchema, { slugs: ['a'] })).toThrow();
    expect(() => validateInput(compareCompaniesSchema, { slugs: ['a', 'b', 'c'] })).toThrow();
    expect(() => validateInput(compareCompaniesSchema, { slugs: ['a', 'a'] })).toThrow(/different/);
    expect(validateInput(compareCompaniesSchema, { slugs: ['a', 'b'] }).slugs).toEqual(['a', 'b']);
  });
});

describe('getCompanyEventsSchema', () => {
  it('rejects years before 1900 and after the current year', () => {
    expect(() => validateInput(getCompanyEventsSchema, { slug: 's', year: 1899 })).toThrow(/year/);
    const next = new Date().getUTCFullYear() + 1;
    expect(() => validateInput(getCompanyEventsSchema, { slug: 's', year: next })).toThrow(
      /current year/
    );
  });

  it('defaults the pagination', () => {
    expect(validateInput(getCompanyEventsSchema, { slug: 's' })).toMatchObject({
      page: 1,
      page_size: 20,
    });
  });
});

describe('getDailySummarySchema', () => {
  it('requires a real calendar date', () => {
    expect(() => validateInput(getDailySummarySchema, { date: '2026-02-30' })).toThrow(/date/);
    expect(() => validateInput(getDailySummarySchema, {})).toThrow(/date/);
  });

  it('only accepts BORME sections 1 and 2', () => {
    expect(() =>
      validateInput(getDailySummarySchema, { date: '2026-07-07', section: '3' })
    ).toThrow(/section/);
    expect(validateInput(getDailySummarySchema, { date: '2026-07-07', section: '1' }).limit).toBe(
      10
    );
  });
});

describe('listSectorCompaniesSchema', () => {
  it('rejects sort=acts/name together with a province', () => {
    expect(() =>
      validateInput(listSectorCompaniesSchema, { cnae: '62', province: 'Madrid', sort: 'acts' })
    ).toThrow(/recent or sort=oldest/);
    expect(
      validateInput(listSectorCompaniesSchema, { cnae: '62', province: 'Madrid', sort: 'oldest' })
        .sort
    ).toBe('oldest');
  });

  it('validates the CNAE code shape', () => {
    expect(() => validateInput(listSectorCompaniesSchema, { cnae: '62010' })).toThrow(/cnae/);
    expect(() => validateInput(listSectorCompaniesSchema, { cnae: 'j' })).toThrow(/cnae/);
    expect(validateInput(listSectorCompaniesSchema, { cnae: 'J' }).cnae).toBe('J');
  });
});

describe('getSectorRatiosSchema', () => {
  it('requires exactly two digits', () => {
    expect(() => validateInput(getSectorRatiosSchema, { cnae: '6' })).toThrow();
    expect(() => validateInput(getSectorRatiosSchema, { cnae: '620' })).toThrow();
    expect(validateInput(getSectorRatiosSchema, { cnae: '62' }).cnae).toBe('62');
  });
});

describe('legal schemas', () => {
  it('accepts bis/ter article numbers and blocks path traversal', () => {
    expect(
      validateInput(getLegalArticleSchema, { norm: 'codigo-de-comercio', n: '160-bis' }).n
    ).toBe('160-bis');
    expect(() => validateInput(getLegalArticleSchema, { norm: 'x', n: '..' })).toThrow(/\.\./);
    expect(() => validateInput(getLegalArticleSchema, { norm: 'x', n: '1/2' })).toThrow();
    expect(() => validateInput(getLegalArticleSchema, { norm: '../x', n: '1' })).toThrow();
    expect(() => validateInput(getLegalArticleSchema, { norm: 'x', n: '.hidden' })).toThrow();
    expect(() => validateInput(getLegalArticleSchema, { norm: 'x', n: '-1' })).toThrow();
  });

  it('the act map slug is optional', () => {
    expect(validateInput(getActMapSchema, {})).toEqual({});
  });
});

describe('searchTendersSchema', () => {
  it('requires amount_kind with an amount bound', () => {
    expect(() => validateInput(searchTendersSchema, { min_amount_eur: 1000 })).toThrow(
      /amount_kind/
    );
    expect(
      validateInput(searchTendersSchema, { min_amount_eur: 1000, amount_kind: 'award' }).limit
    ).toBe(10);
  });

  it('rejects inverted ranges', () => {
    expect(() =>
      validateInput(searchTendersSchema, {
        amount_kind: 'budget',
        min_amount_eur: 10,
        max_amount_eur: 5,
      })
    ).toThrow(/max_amount_eur/);
    expect(() =>
      validateInput(searchTendersSchema, {
        published_from: '2026-02-01',
        published_to: '2026-01-01',
      })
    ).toThrow(/published_to/);
  });

  it('validates CIF/NIF shape (upper case, corporate letters only)', () => {
    expect(() => validateInput(searchTendersSchema, { supplier_cif: 'a82018474' })).toThrow();
    expect(() => validateInput(searchTendersSchema, { supplier_cif: '12345678Z' })).toThrow();
    expect(validateInput(searchTendersSchema, { supplier_cif: 'A82018474' }).supplier_cif).toBe(
      'A82018474'
    );
  });

  it('validates cpv, phase and the province slug', () => {
    expect(() => validateInput(searchTendersSchema, { cpv: '7' })).toThrow();
    expect(() => validateInput(searchTendersSchema, { phase: 'XXX' })).toThrow();
    expect(() => validateInput(searchTendersSchema, { province: 'Madrid' })).toThrow();
  });
});
