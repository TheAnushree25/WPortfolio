import fs from 'node:fs';
import path from 'node:path';

/**
 * A review of the site as it stands: things that are wrong (a picture the
 * site points at but doesn't have), things that will look unfinished to a
 * visitor (placeholder testimonials, a legal notice naming the old host),
 * and housekeeping (unused files, heavy images, changes not yet live).
 * Each finding says where to fix it.
 *
 * Where the site is hosted and how /contact books are read from the site's
 * folder unless the caller knows better: the hosted backend has no folder, so
 * it passes `host` (the provider serving the live site) and `calendly`.
 */

const WEIGHT = { error: 15, warning: 7, info: 2, ok: 0 };

export function siteHealth({ values, library, changes, siteRoot, analytics, packages, host, calendly, hosted = false, now = new Date() }) {
  const checks = [];
  const add = (level, id, title, detail, href = null, action = null) => checks.push({ id, level, title, detail, href, action });
  const year = String(now.getFullYear());

  // Testimonials still holding the template's words.
  const placeholders = (values.testimonials?.cards ?? []).filter((card) => /client name/i.test(card.name) || /company name/i.test(card.role));
  if (placeholders.length) {
    add('warning', 'testimonials', `${placeholders.length} testimonial${placeholders.length > 1 ? 's are' : ' is'} still a placeholder`, 'Visitors see “Client name” and “Company name” in the testimonial cards. Replace them with real client words before sharing the site.', '/content/testimonials', 'Edit testimonials');
  } else add('ok', 'testimonials', 'Testimonials are real client words', '', '/content/testimonials');

  // The legal notice names the host, which has to be the one actually serving the site.
  const legal = (values.footer?.legal?.lines ?? []).join(' ');
  const provider = host !== undefined ? host : fs.existsSync(path.join(siteRoot, 'wrangler.jsonc')) || fs.existsSync(path.join(siteRoot, 'wrangler.toml')) ? 'Cloudflare' : null;
  const other = { Cloudflare: 'Vercel', Vercel: 'Cloudflare' }[provider];
  if (other && new RegExp(other, 'i').test(legal) && !new RegExp(provider, 'i').test(legal)) {
    add('warning', 'legal-host', 'The legal notice names the wrong host', `It says the site is hosted by ${other}, but it is served by ${provider}. Hosting providers must be named correctly in a legal notice.`, '/content/footer', 'Edit the footer');
  }

  // Search and sharing.
  const seo = values.seo ?? {};
  const description = seo.description ?? '';
  if (description.length > 160) add('info', 'seo-description', 'The search description runs long', `It is ${description.length} characters; Google shows about 155. The rest is cut off with “…”.`, '/content/seo', 'Edit search & sharing');
  else if (description.length < 70) add('info', 'seo-description', 'The search description is short', 'A sentence of 120–155 characters gives search results more to show.', '/content/seo', 'Edit search & sharing');
  if (!seo.openGraph?.images) add('warning', 'seo-image', 'Shared links have no preview picture', 'When the site is shared on WhatsApp, LinkedIn or Instagram, no image appears. Add one (1200 × 630) in Search & sharing.', '/content/seo', 'Add a preview image');
  if ((seo.title ?? '').length > 60) add('info', 'seo-title', 'The page title may be cut short', `It is ${seo.title.length} characters; search results show about 60.`, '/content/seo', 'Edit search & sharing');

  // Media the site points at but doesn't have.
  if (library.missing.length) {
    add('error', 'media-missing', `${library.missing.length} file${library.missing.length > 1 ? 's are' : ' is'} missing`, `The site points at ${library.missing.slice(0, 3).join(', ')}${library.missing.length > 3 ? '…' : ''}, which ${library.missing.length > 1 ? 'aren’t' : 'isn’t'} in the public folder. Those pictures will be broken.`, '/media?filter=missing', 'Review media');
  }
  if (library.totals.unused) {
    add('info', 'media-unused', `${library.totals.unused} files aren’t used anywhere`, `They take ${(library.totals.unusedBytes / 1e6).toFixed(1)} MB in every deploy. Remove the ones you don’t need (they go to the trash first).`, '/media?filter=unused', 'Review unused files');
  }
  if (library.totals.large) {
    add('info', 'media-large', `${library.totals.large} heavy file${library.totals.large > 1 ? 's' : ''}`, 'Pictures over 1 MB or videos over 15 MB slow phones on mobile data. Consider WebP or a smaller export.', '/media?filter=large', 'See heavy files');
  }

  // Partner marks whose declared size doesn't match the file.
  const sizes = new Map(library.files.map((file) => [file.path, file]));
  const skewed = (values.partners?.logos ?? []).filter((logo) => {
    const file = sizes.get(logo.src);
    return file?.width && file?.height && Math.abs(file.width / file.height - logo.width / logo.height) > 0.02;
  });
  if (skewed.length) add('warning', 'partner-sizes', `${skewed.length} partner mark${skewed.length > 1 ? 's are' : ' is'} stretched`, `${skewed.map((logo) => logo.name).join(', ')}: the width and height written for the mark don’t match the picture, so it is drawn out of proportion.`, '/content/partners', 'Fix partner sizes');

  // Cards that open only a picture.
  const noDeck = (values.works?.projects ?? []).filter((card) => !values.studies?.[card.slug]);
  if (noDeck.length) add('info', 'no-deck', `${noDeck.length} project${noDeck.length > 1 ? 's open' : ' opens'} a single picture`, `${noDeck.map((card) => card.title).join(', ')} ${noDeck.length > 1 ? 'have' : 'has'} no case study yet, so ${noDeck.length > 1 ? 'they open their shot' : 'it opens its shot'} rather than a deck.`, '/projects', 'See projects');

  // Copyright years.
  const years = [values.studio?.year, values.studio?.copyright, values.footer?.copyright].filter(Boolean).join(' ');
  const stale = [...years.matchAll(/(?:19|20)\d\d/g)].map((match) => match[0]).filter((found) => found !== year);
  if (stale.length) add('warning', 'copyright', 'The copyright year is out of date', `The site says ${[...new Set(stale)].join(', ')}; it’s ${year}.`, '/content/studio', 'Update the year');

  // Bookings.
  if (calendly === undefined) {
    calendly = '';
    try {
      calendly = /^\s*NEXT_PUBLIC_CALENDLY_URL\s*=\s*(\S+)/m.exec(fs.readFileSync(path.join(siteRoot, '.env.local'), 'utf8'))?.[1] ?? '';
    } catch {
      /* no local settings */
    }
  }
  if (calendly) add('ok', 'bookings', 'Bookings go through Calendly', hosted ? `/contact on the live site books into ${calendly}.` : `/contact books into ${calendly}. Make sure the same link is set where the site is built.`);
  else if (calendly !== null) add('warning', 'bookings', 'Bookings fall back to email', hosted ? 'The live /contact page has no Calendly calendar, so it opens the visitor’s email app instead of booking a time. Set NEXT_PUBLIC_CALENDLY_URL where the site is built.' : 'No Calendly link is set in the site’s .env.local, so /contact opens the visitor’s email app instead of booking a time.', '/meetings', 'See meetings');

  // Publishing.
  if (changes.length) add('info', 'unpublished', `${changes.length} change${changes.length > 1 ? 's aren’t' : ' isn’t'} live yet`, hosted ? 'Edits made here are saved as drafts on GitHub. They reach visitors once they’re published.' : 'Edits made here are saved in the site’s files. They reach visitors once the site is built and deployed.', '/publish', 'Review and publish');
  if (!hosted && !packages) add('warning', 'packages', 'The site’s packages aren’t installed', 'Checks, builds and the local preview need them. Install them from the publish page.', '/publish', 'Install packages');
  if (!analytics.hasData) add('info', 'analytics', 'Visits aren’t being counted yet', 'Add the admin’s visit counter to the site to see which projects people open.', '/analytics', 'Set up visit counting');

  const score = Math.max(0, 100 - checks.reduce((sum, check) => sum + WEIGHT[check.level], 0));
  const order = { error: 0, warning: 1, info: 2, ok: 3 };
  return { score, checks: checks.sort((a, b) => order[a.level] - order[b.level]) };
}
