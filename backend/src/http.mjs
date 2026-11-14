import { HttpError, badRequest } from './shared.mjs';

/**
 * HTTP on the web platform's own Request and Response, so the same handler
 * runs under Node's server, as a Vercel Function, or behind any adapter:
 * body readers with size limits, JSON and text replies, and the headers every
 * response carries.
 */

/** The request's body as bytes, refusing anything larger than `limit`. */
export async function readBody(request, limit) {
  const tooLarge = () => new HttpError(413, 'too_large', `That’s larger than ${Math.round(limit / 1_000_000)} MB.`);
  if (Number(request.headers.get('content-length') || 0) > limit) throw tooLarge();
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export async function readJson(request, limit = 2_000_000) {
  const raw = await readBody(request, limit);
  if (!raw.length) return {};
  const type = request.headers.get('content-type') ?? '';
  if (!/application\/json|text\/plain/.test(type)) throw new HttpError(415, 'unsupported', 'Send the request as JSON.');
  try {
    const value = JSON.parse(new TextDecoder().decode(raw));
    return value && typeof value === 'object' ? value : {};
  } catch {
    throw badRequest('That request wasn’t valid JSON.');
  }
}

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body ?? null), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

export function text(status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  return new Response(body, { status, headers: { 'content-type': type, 'cache-control': 'no-store', ...headers } });
}

export function redirect(location, status = 302, headers = {}) {
  return new Response(null, { status, headers: { location, 'cache-control': 'no-store', ...headers } });
}

const csp = (mediaOrigins = []) => [
  "default-src 'self'",
  `img-src 'self' data: blob: ${mediaOrigins.join(' ')}`.trim(),
  `media-src 'self' blob: ${mediaOrigins.join(' ')}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** The admin's security headers, on every response (the same policy the local admin sends). */
export function secure(response, { https = false, mediaOrigins = [] } = {}) {
  const headers = response.headers;
  const set = (name, value) => {
    if (!headers.has(name)) headers.set(name, value);
  };
  try {
    // Pictures the live site serves unchanged are shown from there, so its address may load media.
    set('content-security-policy', csp(mediaOrigins));
    set('x-content-type-options', 'nosniff');
    set('x-frame-options', 'DENY');
    set('referrer-policy', 'same-origin');
    set('cross-origin-opener-policy', 'same-origin');
    set('cross-origin-resource-policy', 'same-origin');
    set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    set('x-robots-tag', 'noindex, nofollow');
    if (https) set('strict-transport-security', 'max-age=31536000');
  } catch {
    // A Response made by fetch() has immutable headers; copy it to add ours.
    const copy = new Response(response.body, { status: response.status, statusText: response.statusText, headers: new Headers(response.headers) });
    return secure(copy, { https, mediaOrigins });
  }
  return response;
}

/** The status and reply for an error, in the admin's { error, message } shape. */
export function failure(error) {
  if (error instanceof HttpError) {
    const headers = error.extra?.retryAfter ? { 'retry-after': String(error.extra.retryAfter) } : {};
    return json(error.status, { error: error.code, message: error.message, ...(error.extra ?? {}) }, headers);
  }
  console.error('[backend]', error);
  return json(500, { error: 'server', message: 'Something went wrong in the admin’s backend. The details are in its logs.' });
}
