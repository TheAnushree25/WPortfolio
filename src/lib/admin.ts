import { env } from './env';

/**
 * What the site tells the studio's admin, once the hosted admin is connected
 * (ADMIN_BACKEND_URL is set where the site is built): each person who starts
 * a booking arrives in Enquiries, and moments worth counting (a meeting
 * booked, the deck downloaded) show in Analytics beside the page views.
 * Everything goes to /admin on the site's own address, so nothing crosses to
 * another site, and nothing here can hold up or break the page.
 */

const COLLECT = '/admin/api/public/collect';
const ENQUIRY = '/admin/api/public/enquiry';

function post(url: string, body: Record<string, unknown>, type = 'application/json') {
  const payload = JSON.stringify(body);
  try {
    if (type === 'text/plain' && navigator.sendBeacon?.(url, new Blob([payload], { type }))) return;
    void fetch(url, { method: 'POST', body: payload, keepalive: true, headers: { 'content-type': type } }).catch(() => {});
  } catch {
    /* the admin is a nicety; the page carries on */
  }
}

/** Counts a named moment ("Booked a meeting") with the admin's cookie-free visit counter. */
export function track(event: string) {
  if (!env.adminConnected || typeof window === 'undefined') return;
  post(COLLECT, { e: event.slice(0, 40) }, 'text/plain');
}

type Enquiry = { name: string; email: string; message?: string; company?: string; trap?: string };

/** Hands a visitor's details to the admin's enquiries. `trap` is a form's hidden field: only bots fill it in. */
export function sendEnquiry({ name, email, message = '', company = '', trap = '' }: Enquiry) {
  if (!env.adminConnected || typeof window === 'undefined' || !email) return;
  post(ENQUIRY, { name, email, message, company, source: 'website', website_url: trap });
}
