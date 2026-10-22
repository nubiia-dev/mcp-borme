import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_RESPONSE_CHARS,
  DEFAULT_REQUESTS_PER_MINUTE,
  parseBaseUrl,
  parseMaxResponseChars,
  parsePositiveInt,
  parseRequestsPerMinute,
  serializeResult,
} from '../utils/config.js';

describe('parsePositiveInt', () => {
  it('uses the default when unset or blank', () => {
    expect(parsePositiveInt(undefined, 'X', 7)).toEqual({ value: 7 });
    expect(parsePositiveInt('  ', 'X', 7)).toEqual({ value: 7 });
  });

  it('accepts valid integers', () => {
    expect(parsePositiveInt('120', 'X', 7)).toEqual({ value: 120 });
  });

  it.each(['abc', '-5', '0', '1.5', 'NaN'])('falls back with a warning for %s', (raw) => {
    const parsed = parsePositiveInt(raw, 'MY_VAR', 7);
    expect(parsed.value).toBe(7);
    expect(parsed.warning).toMatch(/MY_VAR/);
  });

  it('enforces the minimum', () => {
    expect(parsePositiveInt('5', 'X', 10, 10).warning).toBeDefined();
  });
});

describe('env parsers', () => {
  it('default requests per minute matches the anonymous tier', () => {
    expect(parseRequestsPerMinute(undefined).value).toBe(DEFAULT_REQUESTS_PER_MINUTE);
    expect(DEFAULT_REQUESTS_PER_MINUTE).toBe(60);
  });

  it('rejects absurdly small response caps', () => {
    expect(parseMaxResponseChars('10').value).toBe(DEFAULT_MAX_RESPONSE_CHARS);
    expect(parseMaxResponseChars('5000').value).toBe(5000);
  });
});

describe('parseBaseUrl', () => {
  it('returns undefined when unset', () => {
    expect(parseBaseUrl(undefined)).toBeUndefined();
    expect(parseBaseUrl('')).toBeUndefined();
  });

  it('normalises https URLs to their origin', () => {
    expect(parseBaseUrl('https://example.org/some/path/')).toBe('https://example.org');
  });

  it('allows http only for loopback hosts', () => {
    expect(parseBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(parseBaseUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(() => parseBaseUrl('http://example.org')).toThrow(/https/);
  });

  it('rejects non-URLs and other schemes', () => {
    expect(() => parseBaseUrl('not a url')).toThrow(/not a valid URL/);
    expect(() => parseBaseUrl('ftp://example.org')).toThrow(/https/);
  });
});

describe('serializeResult', () => {
  it('returns plain JSON when under the cap', () => {
    expect(serializeResult({ a: 1 }, 1000)).toBe('{"a":1}');
  });

  it('serialises undefined as null instead of throwing', () => {
    expect(serializeResult(undefined, 1000)).toBe('null');
  });

  it('wraps oversized results in a valid JSON envelope that fits the cap', () => {
    const big = { text: 'say "hi" \\ '.repeat(2000) };
    const out = serializeResult(big, 3000);
    expect(out.length).toBeLessThanOrEqual(3000);
    const parsed = JSON.parse(out);
    expect(parsed.truncated).toBe(true);
    expect(parsed.original_chars).toBe(JSON.stringify(big).length);
    expect(parsed.hint).toMatch(/Narrow the request/);
    expect(JSON.stringify(big).startsWith(parsed.partial_json)).toBe(true);
  });
});
