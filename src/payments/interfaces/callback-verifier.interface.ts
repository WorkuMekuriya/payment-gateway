import type { Request } from 'express';

/** Context passed to callback verifiers for authenticity checks. */
export interface CallbackVerificationContext {
  /** Raw request body bytes — required for HMAC verification. */
  rawBody: string;
  /** Normalized request headers (lowercase keys). */
  headers: Record<string, string | string[] | undefined>;
  /** Best-effort client IP (respects X-Forwarded-For when present). */
  sourceIp: string;
  /** Parsed callback payload (when JSON deserialization succeeded). */
  payload?: unknown;
}

/**
 * Verifies that an inbound provider callback is authentic.
 *
 * Implementations may use HMAC signatures, API keys, Basic Auth, IP allowlists,
 * or provider-specific schemes. Add a new implementation per provider without
 * changing controller or orchestration code.
 */
export interface ICallbackVerifier {
  verify(context: CallbackVerificationContext): Promise<boolean>;
}

/** Extracts client IP from Express request, honoring reverse-proxy headers. */
export function extractSourceIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/** Builds a header map with lowercase keys for consistent lookup. */
export function normalizeHeaders(
  req: Request,
): Record<string, string | string[] | undefined> {
  const normalized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}
