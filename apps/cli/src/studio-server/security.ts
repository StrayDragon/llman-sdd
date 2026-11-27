/**
 * Loopback security guards for local Studio Hub (studio-web r144).
 * Blocks DNS Rebinding (Host check) and cross-site CSRF writes (Origin + X-Studio-Token).
 * Pure node:crypto + Hono middleware — zero Bun.* APIs.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { MiddlewareHandler } from 'hono';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function generateStudioToken(): string {
  return randomBytes(24).toString('hex');
}

export function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return true;
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed === '') return false;
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx === -1) return false;
    return LOOPBACK_HOSTS.has(trimmed.slice(0, closeIdx + 1));
  }
  const hostname = trimmed.split(':')[0] ?? '';
  return LOOPBACK_HOSTS.has(hostname);
}

export function isLoopbackOriginHeader(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  try {
    const parsed = new URL(originHeader);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Enforces loopback Host on every request and Origin + X-Studio-Token on all mutating routes.
 */
export function createLoopbackSecurityMiddleware(expectedToken: string): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host');
    if (!isLoopbackHostHeader(host)) {
      return c.json({ error: 'forbidden: non-loopback Host header rejected' }, 403);
    }

    if (MUTATING_METHODS.has(c.req.method.toUpperCase())) {
      const origin = c.req.header('origin');
      if (!isLoopbackOriginHeader(origin)) {
        return c.json({ error: 'forbidden: non-loopback Origin header rejected' }, 403);
      }
      const provided = c.req.header('x-studio-token') ?? c.req.query('token') ?? '';
      if (provided === '' || !tokensEqual(provided, expectedToken)) {
        return c.json({ error: 'forbidden: missing or invalid X-Studio-Token' }, 403);
      }
    }

    await next();
  };
}
