import crypto from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Passwords, tokens, roles, rate limits and the headers every response
 * carries. Passwords are stretched with scrypt (Node's own, no packages) and
 * compared in constant time; session tokens are random and only their
 * SHA-256 is ever stored, so a copied database can't be used to sign in.
 */

const scrypt = promisify(crypto.scrypt);
const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, 64, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash || typeof password !== 'string') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: COST.maxmem,
  });
  return crypto.timingSafeEqual(key, expected);
}

/** Spends the same time as a real check, so an unknown email can't be told apart by how long sign-in takes. */
let decoy;
export async function burnPasswordCheck(password) {
  decoy ??= await hashPassword(crypto.randomBytes(12).toString('hex'));
  await verifyPassword(String(password || ''), decoy);
}

const COMMON = ['password', 'atlasstudio', '12345678', 'qwerty', 'letmein', 'welcome', 'admin123'];

/** Why a password is too weak, or null when it will do. */
export function passwordProblem(password, { email = '' } = {}) {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'That password is longer than 200 characters.';
  if (/^(.)\1+$/.test(password)) return 'Don’t repeat a single character.';
  const lower = password.toLowerCase();
  if (COMMON.some((word) => lower.includes(word))) return 'Avoid common passwords and words like “password”.';
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length > 3 && lower.includes(local)) return 'Don’t use your email address in the password.';
  return null;
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** A temporary password that is easy to read aloud: four groups of four. */
export function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return [0, 4, 8, 12].map((at) => chars.slice(at, at + 4).join('')).join('-');
}

/** Viewers read, editors change content and clients, owners also run the place. */
export const ROLES = ['viewer', 'editor', 'owner'];
export const atLeast = (user, role) => Boolean(user) && ROLES.indexOf(user.role) >= ROLES.indexOf(role);

/** What the admin’s pages may know about an account: never its password hash. */
export const publicUser = (user) =>
  user && {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
    disabled: Boolean(user.disabled),
    mustChangePassword: Boolean(user.mustChangePassword),
  };

/** Counts hits per key in a sliding window. */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  const recent = (key, now) => (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  return {
    hit(key) {
      const now = Date.now();
      const list = recent(key, now);
      list.push(now);
      hits.set(key, list);
      if (hits.size > 5000) {
        for (const [other, times] of hits) if (!times.some((at) => now - at < windowMs)) hits.delete(other);
      }
      return { limited: list.length > max, retryAfter: Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)) };
    },
    blocked(key) {
      const now = Date.now();
      const list = recent(key, now);
      return list.length >= max ? Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)) : 0;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  // The page's <base> names where the admin is mounted (/admin/), so it may only point at this site.
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(res) {
  res.setHeader('content-security-policy', CSP);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'same-origin');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('cross-origin-resource-policy', 'same-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('x-robots-tag', 'noindex, nofollow');
}

/** True for requests from this computer, the only place first-run setup is offered without a token. */
export function isLoopback(address = '') {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.');
}
