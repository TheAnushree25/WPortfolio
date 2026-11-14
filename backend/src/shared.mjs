import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What the backend shares with the admin in ../Admin: its pages, and every
 * part of its server that doesn't depend on the site's files being on this
 * disk. The content engine (reading and rewriting the site's TypeScript and
 * its rules), the field checks, password and token handling, the sample data,
 * the health review, the visit beacon and the Calendly reader each exist once,
 * there, so the local admin and the hosted one can never drift apart.
 *
 * Everything the backend takes from the admin comes through this file.
 */

export { HttpError, badRequest, notFound, forbidden, conflict, Router, MIME, cookie, parseCookies, within } from '../../Admin/server/http.mjs';
export * as check from '../../Admin/server/validate.mjs';
export {
  hashPassword,
  verifyPassword,
  burnPasswordCheck,
  passwordProblem,
  randomToken,
  sha256,
  safeEqual,
  temporaryPassword,
  ROLES,
  atLeast,
  rateLimiter,
  isLoopback,
} from '../../Admin/server/security.mjs';
export { readContent, sectionOf, valuesOf, listSections, planSave, versionOf } from '../../Admin/server/content/store.mjs';
export { SECTIONS, FILES } from '../../Admin/server/content/sections.mjs';
export { clean } from '../../Admin/server/content/rewrite.mjs';
export { parseModule } from '../../Admin/server/content/parse.mjs';
export { siteHealth } from '../../Admin/server/health.mjs';
export { loadSample } from '../../Admin/server/sample.mjs';
export { BEACON, BOT, Analytics, blankDay, dayKey, device, referrerHost } from '../../Admin/server/analytics.mjs';
export { KINDS, kindOf, UPLOADS, dimensions, PATH_IN_SOURCE, FILE_LIKE, SOURCE_EXTS, labelFor } from '../../Admin/server/media.mjs';
export { calendlyMeetings } from '../../Admin/server/calendly.mjs';
export { STATUSES, STATUS_LABELS, SOURCES, SERVICES, BUDGETS, MEETING_STATES, enquiryFields, csvCell } from '../../Admin/server/routes/clients.mjs';
export { MANAGED, isManaged } from '../../Admin/server/git.mjs';

/**
 * The admin's pages. A deployment that ships only this folder carries a copy
 * in .ui (written by `npm run build`); otherwise they're read from ../Admin.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const bundled = path.resolve(here, '..', '.ui');
export const ADMIN_UI_DIR = fs.existsSync(path.join(bundled, 'index.html')) ? bundled : path.resolve(here, '..', '..', 'Admin', 'public');
