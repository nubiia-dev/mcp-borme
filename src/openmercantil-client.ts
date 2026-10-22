import fetch, { RequestInit } from 'node-fetch';

import { normalizeApiKey } from './utils/config.js';

/**
 * OpenMercantil publishes Spanish company data derived from the BORME. Every
 * endpoint is a public GET under `https://openmercantil.es/api/v1/...`.
 * Authentication is OPTIONAL: anonymous calls are served on the free tier
 * (60 req/min and 200 req/day per IP); an `omk_*` API key sent in the
 * `X-API-Key` header selects the account's larger quota.
 */
const DEFAULT_HOST = 'https://openmercantil.es';

/** Per-attempt network timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Longest `Retry-After` the client will sleep through; anything longer is reported to the caller. */
const MAX_RETRY_AFTER_SECONDS = 10;

/** Query values accepted by {@link OpenMercantilClient.get}. `undefined`/`null`/empty arrays are dropped. */
export type QueryValue = string | number | boolean | string[] | undefined | null;
export type QueryParams = Record<string, QueryValue>;

export interface OpenMercantilClientOptions {
  /** Overrides the API host (tests, self-hosted mirrors). Defaults to https://openmercantil.es. */
  host?: string;
  timeoutMs?: number;
}

/** Rate-limit headers of the latest response (`X-RateLimit-*`, `X-OpenMercantil-Plan`). */
export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  /** Unix timestamp (seconds) at which the window resets. */
  reset?: number;
  plan?: string;
}

/**
 * Socket-level errors raised before a request reaches the server. GETs are
 * idempotent, but a timeout or mid-flight reset still burns quota on the free
 * tier (200 req/day), so only the connection-setup failures are retried.
 */
const SAFE_TO_RETRY_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

/** Paths whose 404 may mean "withheld by the identity policy" rather than plain "does not exist". */
const IDENTITY_PATHS = /^\/api\/v1\/(company|empresa|persona|person|grafo)\//;

/** Marks errors thrown by this client so the retry loop can tell them from raw fetch failures. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class OpenMercantilClient {
  private apiKey: string;
  private host: string;
  private timeoutMs: number;
  private maxRetries = 3;
  private backoffDelays = [1000, 2000, 4000]; // milliseconds
  private retryableStatusCodes = new Set([429, 502, 503, 504]);
  private latestRateLimit: RateLimitInfo = {};

  /**
   * @param apiKey - Optional `omk_*` API key. Empty/undefined means anonymous (free tier).
   */
  constructor(apiKey = '', options: OpenMercantilClientOptions = {}) {
    this.apiKey = normalizeApiKey(apiKey);
    this.host = (options.host ?? DEFAULT_HOST).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** True when a key is configured (requests use the account quota instead of the anonymous one). */
  get authenticated(): boolean {
    return this.apiKey.length > 0;
  }

  /** Rate-limit headers of the most recent response, for diagnostics. */
  get rateLimit(): RateLimitInfo {
    return { ...this.latestRateLimit };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Removes the API key from any text that is about to be surfaced to the caller. */
  private redact(text: string): string {
    return this.apiKey ? text.split(this.apiKey).join('[REDACTED]') : text;
  }

  /**
   * Makes untrusted text safe to surface: redacts the key FIRST and truncates
   * afterwards, so a key that straddles the truncation boundary is never cut
   * into an unrecognisable (and unredactable) fragment.
   */
  private sanitize(text: string): string {
    const clean = this.redact(text);
    return clean.length > 500 ? clean.slice(0, 500) + '… [truncated]' : clean;
  }

  /**
   * Builds the request URL. Path segments must already be encoded by the
   * caller (see `encodePathSegment`); query values are encoded here. The API
   * key never goes in the URL.
   */
  private buildUrl(path: string, query: QueryParams): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.length > 0) params.set(key, value.join(','));
        continue;
      }
      params.set(key, String(value));
    }
    const qs = params.toString();
    return `${this.host}${path}${qs ? `?${qs}` : ''}`;
  }

  /**
   * Extracts the human-readable part of an error body. OpenMercantil answers
   * errors with JSON such as `{"error":"validation_failed","detail":"..."}`;
   * anything else (HTML from a proxy, plain text) is passed through sanitized.
   */
  private describeErrorBody(text: string): string {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const code = typeof parsed.error === 'string' ? parsed.error : undefined;
        const detail = typeof parsed.detail === 'string' ? parsed.detail : undefined;
        if (code || detail) return this.sanitize([code, detail].filter(Boolean).join(': '));
      }
    } catch {
      // not JSON: fall through
    }
    return this.sanitize(text);
  }

  private readRateLimit(headers: { get(name: string): string | null }): void {
    const num = (name: string) => {
      const raw = headers.get(name);
      const value = raw === null ? NaN : Number(raw);
      return Number.isFinite(value) ? value : undefined;
    };
    this.latestRateLimit = {
      limit: num('x-ratelimit-limit'),
      remaining: num('x-ratelimit-remaining'),
      reset: num('x-ratelimit-reset'),
      plan: headers.get('x-openmercantil-plan') ?? undefined,
    };
  }

  /** Seconds to wait before retrying, from the `Retry-After` header (delta-seconds form only). */
  private retryAfterSeconds(headers: { get(name: string): string | null }): number | undefined {
    const raw = headers.get('retry-after');
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  /** Explains a 429 in terms of the plan the API reported, so the caller knows what to do. */
  private rateLimitMessage(body: string, retryAfter: number | undefined): string {
    const plan = this.latestRateLimit.plan;
    const wait =
      retryAfter !== undefined
        ? ` Retry after ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`
        : '';
    const upgrade = this.authenticated
      ? ' The quota of the configured OPENMERCANTIL_API_KEY is exhausted.'
      : ' Anonymous access is limited to 60 requests/minute and 200 requests/day per IP; ' +
        'set OPENMERCANTIL_API_KEY (https://openmercantil.es) for a larger quota.';
    return (
      `OpenMercantil rate limit reached${plan ? ` (plan: ${plan})` : ''}: ${body}.` + wait + upgrade
    );
  }

  /**
   * Issues a GET against the OpenMercantil API and returns the parsed JSON.
   *
   * Retries 429/502/503/504 and connection-setup failures with backoff. A
   * `Retry-After` of up to 10 s is honoured; a longer one (typically the daily
   * quota) is surfaced immediately instead of blocking the assistant.
   *
   * @param path - Absolute API path starting with `/api/v1/`, segments already encoded.
   * @param query - Query parameters; nullish values and empty arrays are omitted.
   * @throws {ApiError} on HTTP errors, timeouts, invalid JSON and exhausted retries.
   */
  async get<T = unknown>(path: string, query: QueryParams = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const isLastAttempt = attempt === this.maxRetries - 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const options: RequestInit = {
        method: 'GET',
        headers,
        // Never follow redirects: node-fetch only strips `authorization` and `cookie` when a
        // redirect leaves the origin, so X-API-Key would be replayed to the other host.
        redirect: 'error',
        signal: controller.signal as RequestInit['signal'],
      };

      try {
        const response = await fetch(url, options);
        this.readRateLimit(response.headers);

        if (!response.ok) {
          const body = this.describeErrorBody(await response.text());
          const retryAfter = this.retryAfterSeconds(response.headers);
          const retryable = this.retryableStatusCodes.has(response.status);
          const waitable = retryAfter === undefined || retryAfter <= MAX_RETRY_AFTER_SECONDS;

          if (retryable && waitable && !isLastAttempt) {
            lastError = new ApiError(
              `OpenMercantil API error (${response.status}): ${body}`,
              response.status
            );
            await this.sleep(
              retryAfter !== undefined ? retryAfter * 1000 : this.backoffDelays[attempt]
            );
            continue;
          }
          if (response.status === 429) {
            throw new ApiError(this.rateLimitMessage(body, retryAfter), 429);
          }
          if (response.status === 401 || response.status === 403) {
            throw new ApiError(
              `OpenMercantil API error (${response.status}): ${body}. The OPENMERCANTIL_API_KEY ` +
                `is invalid, revoked or lacks the scope this endpoint needs. Unset it to use ` +
                `anonymous access, or create a new key at https://openmercantil.es.`,
              response.status
            );
          }
          if (response.status === 404) {
            throw new ApiError(
              `OpenMercantil API error (404): ${body}.` +
                (IDENTITY_PATHS.test(path)
                  ? ` Not found: the identity does not exist or is withheld by ` +
                    `OpenMercantil's identity policy (withheld, ambiguous and personal ` +
                    `identities are never confirmed).`
                  : ''),
              404
            );
          }
          throw new ApiError(
            `OpenMercantil API error (${response.status}): ${body}`,
            response.status
          );
        }

        const text = await response.text();
        if (!text) {
          return {} as T;
        }
        try {
          return JSON.parse(text) as T;
        } catch (parseError) {
          throw new ApiError(
            `OpenMercantil returned an invalid JSON response: ${this.sanitize(
              parseError instanceof Error ? parseError.message : String(parseError)
            )}`
          );
        }
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        const err = error as NodeJS.ErrnoException & { name?: string };
        if (err?.name === 'AbortError') {
          throw new ApiError(
            `OpenMercantil request timed out after ${Math.round(this.timeoutMs / 1000)}s. It was ` +
              `not retried to avoid wasting request quota.`
          );
        }
        if ((err as { type?: string })?.type === 'no-redirect') {
          throw new ApiError(
            `OpenMercantil answered with a redirect, which this client refuses to follow so the ` +
              `API key is never sent to another host. Check OPENMERCANTIL_BASE_URL.`
          );
        }
        const code = err?.code;
        if (code && SAFE_TO_RETRY_NETWORK_CODES.has(code) && !isLastAttempt) {
          lastError = err;
          await this.sleep(this.backoffDelays[attempt]);
          continue;
        }
        throw new ApiError(
          `OpenMercantil request failed: ${this.sanitize(err?.message ?? String(error))}`
        );
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new Error('Request failed after retries');
  }
}

/**
 * Percent-encodes one URL path segment. Validation already restricts slugs to
 * `[a-z0-9-]`, so this is defence in depth against path traversal (`../`).
 */
export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}
