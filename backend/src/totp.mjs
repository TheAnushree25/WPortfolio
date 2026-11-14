import crypto from 'node:crypto';

/**
 * Two-step sign-in with an authenticator app (Google Authenticator, 1Password,
 * Authy…): time-based one-time codes as RFC 6238 defines them, six digits
 * every 30 seconds from a shared secret, plus one-time recovery codes for a
 * lost phone. Only Node's crypto is used.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Not base32.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh secret: 160 random bits, as the 32 letters and digits an app can also take typed in. */
export const newSecret = () => base32Encode(crypto.randomBytes(20));

export const stepAt = (time = Date.now()) => Math.floor(time / 1000 / STEP);

/** The code for a time step (RFC 4226's HOTP over the step number). */
export function codeAt(secret, step, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const number = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(number % 10 ** digits).padStart(digits, '0');
}

/**
 * The step a code belongs to, or 0 when it doesn't match. A code from the
 * previous or next 30 seconds is accepted (phones' clocks drift), but never
 * one at or before `lastStep`, so an overheard code can't be used again.
 */
export function verifyCode(secret, code, { time = Date.now(), lastStep = 0, window = 1 } = {}) {
  const digits = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(digits)) return 0;
  const now = stepAt(time);
  for (let delta = -window; delta <= window; delta++) {
    const step = now + delta;
    if (step <= lastStep) continue;
    const expected = codeAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digits))) return step;
  }
  return 0;
}

/** The address an authenticator app scans: otpauth://totp/Issuer:account?secret=…&issuer=Issuer */
export function otpauthUri({ secret, account, issuer = 'Atlas Studios' }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

/** Ten recovery codes like "k7qm-2x9d", each good once; only their hashes are kept. */
export function newRecoveryCodes(count = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: count }, () => {
    const chars = [...crypto.randomBytes(8)].map((byte) => alphabet[byte % alphabet.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export const hashRecovery = (code) =>
  crypto
    .createHash('sha256')
    .update(String(code ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .digest('hex');
