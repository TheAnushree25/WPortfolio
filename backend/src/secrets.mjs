import crypto from 'node:crypto';

/**
 * Secrets the admin has to keep but should never hold in plain text (the
 * Calendly token, each person's two-step sign-in key) are sealed with
 * AES-256-GCM under a key derived from ADMIN_SECRET. A copied database is
 * then useless without the server's environment, and tampering is detected.
 */

export function createSealer(secret) {
  // Without ADMIN_SECRET (local work only; production refuses to start) a fixed key keeps things working.
  const material = secret || 'atlas-admin-local-development-only';
  const key = crypto.hkdfSync('sha256', Buffer.from(material, 'utf8'), Buffer.from('atlas-admin'), Buffer.from('sealed-settings-v1'), 32);
  return {
    seal(text) {
      if (text === null || text === undefined || text === '') return '';
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), iv);
      const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
      return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
    },
    open(sealed) {
      if (!sealed) return '';
      if (!sealed.startsWith('v1.')) throw new Error('Not a sealed value.');
      const raw = Buffer.from(sealed.slice(3), 'base64url');
      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}
