import { describe, it, expect } from 'vitest';
import { cleanResponse, limitArray, summarizeDaily, trimCompanyReport } from '../domain/shape.js';

const boilerplate = {
  _source_catalog: { sources: { borme: {} } },
  _data_sources_used: [{ slug: 'borme' }],
  _attributions: { borme: 'Basado en datos de la Agencia Estatal Boletín Oficial del Estado.' },
};

describe('cleanResponse', () => {
  it('drops the licence catalogue but keeps the attribution', () => {
    const cleaned = cleanResponse({ a: 1, ...boilerplate }) as Record<string, unknown>;
    expect(cleaned).toEqual({ a: 1, _attributions: boilerplate._attributions });
  });

  it('passes non-objects through untouched', () => {
    expect(cleanResponse(null)).toBeNull();
    expect(cleanResponse([1, 2])).toEqual([1, 2]);
    expect(cleanResponse('x')).toBe('x');
  });

  it('does not mutate its input', () => {
    const input = { a: 1, ...boilerplate };
    cleanResponse(input);
    expect(input._source_catalog).toBeDefined();
  });
});

describe('limitArray', () => {
  it('keeps the first N and reports totals', () => {
    expect(limitArray({ events: [1, 2, 3, 4] }, 'events', 2)).toEqual({
      events: [1, 2],
      events_total: 4,
      events_truncated: true,
    });
  });

  it('reports truncated=false when everything fits', () => {
    expect(limitArray({ events: [1] }, 'events', 5)).toMatchObject({ events_truncated: false });
  });

  it('is a no-op when the key is missing or not an array (upstream shape drift)', () => {
    expect(limitArray({ other: 1 }, 'events', 2)).toEqual({ other: 1 });
    expect(limitArray({ events: 'nope' }, 'events', 2)).toEqual({ events: 'nope' });
  });
});

describe('trimCompanyReport', () => {
  const events = Array.from({ length: 50 }, (_, i) => ({ id: i }));

  it('bounds events, points to the paginated tool and strips boilerplate', () => {
    const out = trimCompanyReport({ company: { slug: 's' }, events, ...boilerplate }, 10) as any;
    expect(out.events).toHaveLength(10);
    expect(out.events_total).toBe(50);
    expect(out.events_truncated).toBe(true);
    expect(out.events_note).toMatch(/borme_get_company_events/);
    expect(out._source_catalog).toBeUndefined();
    expect(out._attributions).toBeDefined();
    expect(out.company.slug).toBe('s');
  });

  it('events_limit 0 returns no events but still reports the total', () => {
    const out = trimCompanyReport({ events }, 0) as any;
    expect(out.events).toEqual([]);
    expect(out.events_total).toBe(50);
  });

  it('adds no note when nothing was cut', () => {
    const out = trimCompanyReport({ events: events.slice(0, 3) }, 10) as any;
    expect(out.events_note).toBeUndefined();
  });
});

describe('summarizeDaily', () => {
  const acts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }));
  const daily = {
    date: '20260707',
    sections: {
      '1': { Madrid: acts(30), Málaga: acts(5), Barcelona: acts(2) },
      '2': { National: acts(4) },
    },
    ...boilerplate,
  };

  it('returns exact counts and the first N acts per province', () => {
    const out = summarizeDaily(daily, { limit: 3 }) as any;
    expect(out.total_acts).toBe(41);
    expect(out.returned_acts).toBe(3 + 3 + 2 + 3);
    expect(out.truncated).toBe(true);
    expect(out.counts_by_section_and_province).toEqual({
      '1': { Madrid: 30, Málaga: 5, Barcelona: 2 },
      '2': { National: 4 },
    });
    expect(out.sections['1'].Madrid).toHaveLength(3);
    expect(out.date).toBe('20260707');
    expect(out._source_catalog).toBeUndefined();
    expect(out.note).toMatch(/at most 3 acts per province/);
  });

  it('filters by province ignoring case and accents', () => {
    const out = summarizeDaily(daily, { province: 'malaga', limit: 10 }) as any;
    expect(out.counts_by_section_and_province).toEqual({ '1': { Málaga: 5 } });
    expect(out.total_acts).toBe(5);
    expect(out.truncated).toBe(false);
    expect(out.note).toBeUndefined();
  });

  it('filters by section', () => {
    const out = summarizeDaily(daily, { section: '2', limit: 10 }) as any;
    expect(Object.keys(out.sections)).toEqual(['2']);
    expect(out.total_acts).toBe(4);
  });

  it('returns empty results when the province does not match', () => {
    const out = summarizeDaily(daily, { province: 'Atlantis', limit: 10 }) as any;
    expect(out.total_acts).toBe(0);
    expect(out.sections).toEqual({});
  });

  it('passes an unexpected shape through instead of throwing', () => {
    expect(summarizeDaily({ weird: true }, { limit: 5 })).toEqual({ weird: true });
  });
});
