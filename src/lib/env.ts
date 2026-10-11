/**
 * Public settings read at build time. NEXT_PUBLIC_* values are inlined into the
 * client bundle, so only non-secret configuration belongs here.
 */
export const env = {
  /** Cal.com booking link for /contact, as "username/event-slug"; empty takes requests by email. */
  calLink: (process.env.NEXT_PUBLIC_CAL_LINK ?? '').trim().replace(/^https?:\/\/(app\.)?cal\.com\//, ''),
} as const;
