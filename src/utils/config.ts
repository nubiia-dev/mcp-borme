/**
 * Runtime configuration read from environment variables.
 *
 * Parsing lives here (not in index.ts) so it can be unit-tested without
 * starting the server. Invalid optional values fall back to their default
 * with a warning instead of aborting: a typo in a tuning knob should not
 * take the whole server down.
 */

export const API_KEY_ENV = 'OPENMERCANTIL_API_KEY';
export const BASE_URL_ENV = 'OPENMERCANTIL_BASE_URL';
export const RPM_ENV = 'OPENMERCANTIL_MAX_REQUESTS_PER_MINUTE';
export const MAX_CHARS_ENV = 'OPENMERCANTIL_MAX_RESPONSE_CHARS';

export const DEFAULT_REQUESTS_PER_MINUTE = 60;
export const DEFAULT_MAX_RESPONSE_CHARS = 60_000;
const MIN_MAX_RESPONSE_CHARS = 1_000;

/**
 * True for values that are really "not configured": empty/blank, or an
 * unsubstituted template placeholder such as `${user_config.openmercantil_api_key}`.
 * An MCPB host that does not fill an optional field could hand the literal
 * placeholder to the process; treating it as a key would send a bogus
 * X-API-Key and turn every anonymous call into a 401.
 */
export function isUnset(raw: string | undefined): boolean {
  return raw === undefined || raw.trim() === '' || raw.trim().startsWith('${');
}

/** Returns the trimmed API key, or an empty string (anonymous tier) when it is unset. */
export function normalizeApiKey(raw: string | undefined): string {
  return isUnset(raw) ? '' : (raw as string).trim();
}

export interface ParsedNumber {
  value: number;
  /** Set when the raw value was invalid and the default was used. */
  warning?: string;
}

/**
 * Parses a positive-integer env var.
 *
 * @param raw - The raw env value (undefined/empty means "use the default").
 * @param name - Env var name, for the warning text.
 * @param def - Default used when absent or invalid.
 * @param min - Smallest accepted value.
 */
export function parsePositiveInt(
  raw: string | undefined,
  name: string,
  def: number,
  min = 1
): ParsedNumber {
  if (isUnset(raw)) return { value: def };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    return {
      value: def,
      warning: `${name}="${raw}" is not an integer >= ${min}; using the default (${def}).`,
    };
  }
  return { value };
}

export const parseRequestsPerMinute = (raw: string | undefined) =>
  parsePositiveInt(raw, RPM_ENV, DEFAULT_REQUESTS_PER_MINUTE);

export const parseMaxResponseChars = (raw: string | undefined) =>
  parsePositiveInt(raw, MAX_CHARS_ENV, DEFAULT_MAX_RESPONSE_CHARS, MIN_MAX_RESPONSE_CHARS);

/**
 * Validates the optional host override. The API key travels in a header, so a
 * plain-http remote host would leak it: only https, or http to loopback (for
 * local mocks), is accepted.
 *
 * @returns The normalised origin, or `undefined` when no override is set.
 * @throws Error when the value is not a URL or uses an insecure remote scheme.
 */
export function parseBaseUrl(raw: string | undefined): string | undefined {
  if (isUnset(raw)) return undefined;
  let url: URL;
  try {
    url = new URL((raw as string).trim());
  } catch {
    // Never echo the value: a URL can embed credentials (https://user:pass@host).
    throw new Error(`${BASE_URL_ENV} is not a valid URL.`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`${BASE_URL_ENV} must use https (http is only allowed for localhost).`);
  }
  return url.origin;
}

/**
 * Serialises a tool result for the MCP response, bounding its size.
 *
 * A result larger than `maxChars` is replaced by a small valid-JSON envelope
 * holding the leading part of the payload, so the assistant learns that data
 * was cut (and how to narrow the request) instead of receiving broken JSON.
 */
export function serializeResult(result: unknown, maxChars: number): string {
  const text = JSON.stringify(result) ?? 'null';
  if (text.length <= maxChars) return text;
  const envelope = (keep: number) =>
    JSON.stringify({
      truncated: true,
      original_chars: text.length,
      max_chars: maxChars,
      hint:
        'The response exceeded the size limit and was cut. Narrow the request (smaller limit / ' +
        'page_size, a province or year filter) or raise OPENMERCANTIL_MAX_RESPONSE_CHARS.',
      partial_json: text.slice(0, keep),
    });
  // JSON-escaping the excerpt (quotes, backslashes) inflates it, so shrink until the whole
  // envelope fits the budget.
  let keep = Math.max(0, maxChars - 600);
  let out = envelope(keep);
  while (out.length > maxChars && keep > 0) {
    keep = Math.floor(keep * 0.8);
    out = envelope(keep);
  }
  return out;
}
