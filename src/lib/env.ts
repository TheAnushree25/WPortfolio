/**
 * Public settings read at build time. NEXT_PUBLIC_* values are inlined into the
 * client bundle, so only non-secret configuration belongs here.
 */
const calendly = (process.env.NEXT_PUBLIC_CALENDLY_URL ?? '')
  .trim()
  .replace(/^(?:https?:\/\/)?(?:www\.)?calendly\.com\//, 'https://calendly.com/');

export const env = {
  /** Calendly event link for /contact, e.g. https://calendly.com/theatlasstudio/meeting; set, it takes priority. */
  calendlyUrl: calendly.startsWith('https://calendly.com/') ? calendly : '',
  /** Cal.com booking link for /contact, as "username/event-slug"; empty takes requests by email. */
  calLink: (process.env.NEXT_PUBLIC_CAL_LINK ?? '').trim().replace(/^https?:\/\/(app\.)?cal\.com\//, ''),
  /** Whether /admin is the hosted admin (next.config sets it from ADMIN_BACKEND_URL): the site then sends it enquiries and visits. */
  adminConnected: process.env.NEXT_PUBLIC_ADMIN_CONNECTED === '1',
} as const;
