import { initials, slugify } from '../lib/format.js';
import { thumbUrl } from '../lib/dom.js';

/**
 * How each part of the site is edited: one schema per content section, plus
 * the design-project and system editors. Field names follow the site's own
 * content files (src/content/site.ts and friends), so what is saved here is
 * exactly what the site reads.
 */

const text = (key, label, extra = {}) => ({ key, type: 'text', label, ...extra });
const area = (key, label, extra = {}) => ({ key, type: 'textarea', label, ...extra });
const link = (key, label, extra = {}) => ({ key, type: 'link', label, ...extra });
const group = (key, label, fields, extra = {}) => ({ key, type: 'group', label, fields, ...extra });
const words = (key, label, keys, description) => group(key, label, keys.map(([k, l]) => text(k, l)), { open: false, columns: 2, description });

export const SCHEMAS = {
  studio: [
    { type: 'heading', label: 'The studio' },
    text('name', 'Studio name', { required: true }),
    text('owner', 'Owner', { required: true, hint: 'Named in the legal notice and the page title.' }),
    text('wordmark', 'Wordmark', { hint: 'The letters the landing assembles, letter by letter.' }),
    text('year', 'Year mark', { hint: 'Shown as ©2026 beside the wordmark.' }),
    text('copyright', 'Copyright line', { span: 2 }),
    { type: 'heading', label: 'Contact' },
    { key: 'email', type: 'email', label: 'Email', required: true, hint: 'The footer’s email link and “Drop us a line” follow this.' },
    { key: 'linkedin', type: 'url', label: 'LinkedIn' },
    { key: 'instagram', type: 'url', label: 'Instagram' },
    { key: 'resume', type: 'url', label: 'Résumé link' },
  ],

  seo: [
    { type: 'note', text: 'This is what Google shows for the site, and what WhatsApp, LinkedIn and Instagram show when someone shares a link to it.' },
    text('title', 'Page title', { required: true, counter: 60, hint: 'About 60 characters show in search results.', span: 2 }),
    area('description', 'Description', { required: true, counter: 155, rows: 3, hint: 'Aim for 120–155 characters: who the studio is and what it does.', span: 2 }),
    group('openGraph', 'When the link is shared', [
      text('title', 'Shared title'),
      area('description', 'Shared description', { rows: 2, counter: 200 }),
      { key: 'type', type: 'select', label: 'Kind of page', options: ['website', 'profile', 'article'] },
      { key: 'images', type: 'lines', label: 'Preview image', optional: true, itemLabel: 'Image path', placeholder: '/images/share.jpg', maxItems: 1, hint: 'A 1200 × 630 picture from the public folder, e.g. /images/atlas-intro-poster.jpg.' },
    ]),
  ],

  viewport: [{ key: 'themeColor', type: 'color', label: 'Browser bar colour', hint: 'Phones tint their address bar with this. The site’s night blue is #020923.' }],

  nav: [
    { key: 'links', type: 'list', label: 'Header links', item: { label: 'Link', title: (v) => v.label, subtitle: (v) => v.href, fields: [text('label', 'Label', { required: true }), link('href', 'Goes to', { required: true }), { key: 'sections', type: 'chips', label: 'Lights its dot over', hint: 'The landing’s section ids (work, about, clients…) during which this link shows its dot.' }], create: () => ({ label: '', href: '/', sections: [] }) }, maxItems: 4 },
    group('contact', 'Contact pill', [text('label', 'Label', { required: true }), link('href', 'Goes to', { required: true })], { columns: 2 }),
  ],

  footer: [
    text('title', 'Closing title', { hint: 'Formed from sand over the globe.' }),
    { key: 'locations', type: 'list', label: 'Where the studio works', item: { label: 'Location', title: (v) => v.place, subtitle: (v) => v.detail, columns: 2, fields: [text('place', 'Place', { required: true }), text('detail', 'Detail')], create: () => ({ place: '', detail: '' }) } },
    group('contact', 'Ways to start a project', [
      text('title', 'Heading', { span: 2 }),
      group('deck', 'Get the deck', [text('label', 'Label'), link('href', 'Opens'), { key: 'pdf', type: 'image', kind: 'document', folder: 'docs', label: 'PDF', hint: 'Downloaded in the same click.' }, text('file', 'Saved as', { hint: 'The file name visitors get.' })], { columns: 2, open: false }),
      group('line', 'Drop us a line', [text('label', 'Label'), link('href', 'Opens')], { columns: 2, open: false }),
      group('talk', 'Let’s talk', [text('label', 'Label'), link('href', 'Opens')], { columns: 2, open: false }),
    ]),
    { key: 'links', type: 'list', label: 'Footer links', item: { label: 'Link', title: (v) => v.label, subtitle: (v) => v.href, columns: 2, fields: [text('label', 'Label', { required: true }), link('href', 'Goes to', { required: true })], create: () => ({ label: '', href: 'https://' }) } },
    text('copyright', 'Credits line', { span: 2 }),
    group('legal', 'Legal notice', [text('label', 'Link label'), text('close', 'Close button'), { key: 'lines', type: 'lines', label: 'Lines', itemLabel: 'Line', hint: 'Name the publisher, a contact and the host. The site is served by Cloudflare.' }]),
    text('top', 'Back-to-top label'),
  ],

  hero: [
    { key: 'statement', type: 'lines', label: 'Statement', itemLabel: 'Line', min: 1, maxItems: 3, required: true, hint: 'Each line is set on its own line of the studio slide.' },
    area('mission', 'Mission line', { rows: 4, required: true, counter: 260 }),
    text('scrollCue', 'Scroll cue'),
    text('emblem', 'Emblem description', { hint: 'Read aloud by screen readers.' }),
    group('reel', 'Intro reel', [
      text('label', 'Description', { span: 2 }),
      { key: 'src', type: 'image', kind: 'video', folder: 'video', label: 'Video (large screens)' },
      { key: 'small', type: 'image', kind: 'video', folder: 'video', label: 'Video (phones)' },
      { key: 'poster', type: 'image', folder: 'images', label: 'Poster frame', hint: 'Shown until the reel starts.' },
      text('skip', 'Skip button'),
      text('play', 'Play button'),
      text('soundOn', 'Sound on'),
      text('soundOff', 'Sound off'),
    ], { columns: 2 }),
  ],

  works: [
    text('title', 'Section title', { required: true }),
    text('tagline', 'Tagline'),
    text('cta', 'Card button'),
    text('close', 'Close label'),
    { type: 'note', text: 'The cards themselves (pictures, order, case studies) are edited in Projects.', href: '/projects', linkLabel: 'Go to Projects' },
    words('viewer', 'Project viewer words', [['eyebrow', 'Eyebrow'], ['pages', 'Pages'], ['chapters', 'Chapters'], ['start', 'Start reading'], ['index', 'Index'], ['close', 'Close'], ['back', 'Back'], ['end', 'End of the deck'], ['next', 'Next project'], ['view', 'View the project'], ['editions', 'Edition'], ['scroll', 'Scroll']], 'The labels around a design deck.'),
    words('system', 'System viewer words', [['eyebrow', 'Eyebrow'], ['cta', 'Card button'], ['brief', 'The brief'], ['stack', 'Tech stack'], ['journeys', 'User journeys'], ['design', 'Design'], ['screens', 'Screens'], ['numbers', 'In numbers'], ['chapter', 'Chapter'], ['visit', 'Visit the live site'], ['end', 'End of the case study'], ['built', 'Built with'], ['flow', 'How it fits'], ['outcome', 'Outcome'], ['palette', 'Colour'], ['type', 'Type'], ['principles', 'Principles'], ['desktop', 'On a desktop'], ['phone', 'On a phone'], ['highlights', 'Highlights']], 'The labels around a system case study.'),
  ],

  practice: [
    { key: 'title', type: 'lines', label: 'Title', itemLabel: 'Line', maxItems: 3 },
    { key: 'columns', type: 'list', label: 'Columns', maxItems: 6, item: { label: 'Column', title: (v) => v.heading, subtitle: (v) => `${v.items?.length ?? 0} items`, fields: [text('heading', 'Heading', { required: true }), { key: 'items', type: 'lines', label: 'Items', itemLabel: 'Item' }], create: () => ({ heading: '', items: [''] }) } },
  ],

  story: [
    { key: 'title', type: 'lines', label: 'Title', itemLabel: 'Line', maxItems: 3 },
    { key: 'paragraphs', type: 'paragraphs', label: 'Paragraphs', itemLabel: 'Paragraph', required: true },
  ],

  partners: [
    text('title', 'Section title', { required: true }),
    {
      key: 'logos',
      type: 'list',
      label: 'Client marks',
      hint: 'Each mark is a white logo on a transparent background. Choosing a file fills in its size.',
      item: {
        label: 'Mark',
        title: (v) => v.name,
        subtitle: (v) => v.src,
        thumb: (v) => thumbUrl(v.src),
        columns: 2,
        fields: [text('name', 'Client', { required: true }), { key: 'src', type: 'image', folder: 'images/partners', label: 'Mark', dims: ['width', 'height'], dark: true, required: true }, { key: 'width', type: 'number', label: 'Width (px)', integer: true, min: 1 }, { key: 'height', type: 'number', label: 'Height (px)', integer: true, min: 1 }],
        create: () => ({ name: '', src: '', width: 300, height: 200 }),
      },
    },
  ],

  method: [
    text('title', 'Section title', { required: true }),
    { key: 'steps', type: 'list', label: 'Steps', hint: 'Each step becomes a card in the stacking timeline.', item: { label: 'Step', title: (v) => v.title, subtitle: (v) => v.text, fields: [text('title', 'Title', { required: true }), area('text', 'Text', { rows: 3, required: true, counter: 160 })], create: () => ({ title: '', text: '' }) } },
  ],

  testimonials: [
    text('label', 'Section label'),
    {
      key: 'cards',
      type: 'list',
      label: 'Testimonials',
      min: 1,
      hint: 'The front card shows first; the rest stack behind it.',
      item: {
        label: 'Testimonial',
        title: (v) => v.name,
        subtitle: (v) => v.role,
        open: true,
        fields: [
          area('quote', 'Quote', { rows: 4, required: true, counter: 220 }),
          {
            key: 'name',
            type: 'text',
            label: 'Name',
            required: true,
            // The initials follow the name until someone types their own.
            onInput: ({ value, previous, item, notify }) => {
              if (!item.initials || item.initials === initials(previous ?? '')) {
                item.initials = value.trim() ? initials(value) : '';
                notify('initials');
              }
            },
          },
          text('role', 'Role — Company'),
          text('initials', 'Initials', { max: 3, hint: 'Shown in the round avatar.' }),
        ],
        create: () => ({ quote: '', name: '', role: '', initials: '' }),
      },
    },
  ],

  nextPage: [
    text('overline', 'Overline'),
    text('title', 'Title', { required: true }),
    text('cta', 'Travelling line'),
    text('label', 'Link label'),
    link('href', 'Goes to'),
    { key: 'clip', type: 'image', kind: 'video', folder: 'video', label: 'Hover clip' },
  ],

  worksPage: [
    text('title', 'Title', { required: true }),
    text('intro', 'Intro'),
    text('nowShowing', 'Screening room label'),
    words('filters', 'Filter words', [['label', 'Filters'], ['discipline', 'Discipline'], ['industry', 'Industry'], ['clear', 'Clear all'], ['none', 'Nothing matches']]),
    group('rows', 'Rows', [
      group('systems', 'Systems row', [text('number', 'Number'), text('title', 'Title'), text('line', 'Line', { span: 2 }), { key: 'tags', type: 'chips', label: 'Tags' }], { columns: 2 }),
      group('design', 'Design row', [text('number', 'Number'), text('title', 'Title'), text('line', 'Line', { span: 2 }), { key: 'tags', type: 'chips', label: 'Tags' }], { columns: 2 }),
    ]),
    group('next', 'Teaser at the foot', [text('overline', 'Overline'), text('title', 'Title'), text('cta', 'Travelling line'), text('label', 'Link label'), link('href', 'Goes to')], { columns: 2, open: false }),
  ],

  deck: [
    text('title', 'Title', { required: true }),
    text('overline', 'Overline'),
    area('intro', 'Intro', { rows: 2 }),
    { key: 'pdf', type: 'image', kind: 'document', folder: 'docs', label: 'The PDF' },
    text('download', 'Download button'),
    text('open', 'Open button'),
    { key: 'slides', type: 'readonly', label: 'Slides', format: (v) => `${v?.length ?? 0} slides in /deck, made by scripts/deck/retheme.py`, hint: 'Re-run the deck script to change the slides.' },
  ],

  booking: [
    { type: 'heading', label: 'The meeting' },
    text('studio', 'Studio name'),
    text('title', 'Meeting name', { required: true, hint: 'Keep it the same as the Calendly event.' }),
    text('duration', 'Duration label', { hint: 'Shown as written, e.g. 45m.' }),
    { key: 'minutes', type: 'number', label: 'Length (minutes)', integer: true, min: 5, max: 480 },
    text('location', 'Where'),
    { key: 'email', type: 'email', label: 'Bookings inbox' },
    { type: 'heading', label: 'When' },
    { key: 'slots', type: 'times', label: 'Start times (India time)', hint: 'Used by the studio’s own booker (without Calendly), Monday to Friday. Calendly keeps its own hours.', span: 2 },
    { key: 'studioOffsetMinutes', type: 'number', label: 'Studio time zone offset (minutes)', integer: true, hint: '330 is India (UTC+5:30).' },
    { key: 'horizon', type: 'number', label: 'Bookable ahead (days)', integer: true, min: 1, max: 365 },
    { type: 'heading', label: 'Words on /contact' },
    words('form', 'The form', [['name', 'Name'], ['email', 'Email'], ['notes', 'Notes'], ['next', 'Next'], ['back', 'Back'], ['send', 'Send'], ['sending', 'Sending']]),
    words('calendly', 'The calendar step', [['intro', 'Intro'], ['as', 'Booking as'], ['edit', 'Change details'], ['loading', 'Loading'], ['failed', 'Didn’t load'], ['open', 'Open on Calendly'], ['or', 'or'], ['write', 'email us']]),
    words('booked', 'Booked', [['title', 'Title'], ['body', 'Body'], ['join', 'Join link'], ['ics', 'Add to calendar'], ['again', 'Book again']]),
    words('sent', 'Sent by email', [['title', 'Title'], ['body', 'Body'], ['again', 'Pick again']]),
    words('errors', 'Errors', [['taken', 'Time taken'], ['invalid', 'Invalid details'], ['limited', 'Too many tries']]),
    text('taken', 'Booked-time label'),
    words('note', 'Note under the booker', [['calendar', 'With a calendar'], ['inbox', 'By email']]),
  ],
};

/** The design card (Selected work) and its case study, edited together. */
export function designSchema({ isNew, industries, decks }) {
  const card = [
    { type: 'heading', label: 'The card' },
    text('title', 'Title', {
      required: true,
      // A new project's address follows its title until it is edited by hand.
      onInput: ({ value, previous, item, notify }) => {
        if (isNew && (!item.slug || item.slug === slugify(previous ?? ''))) {
          item.slug = slugify(value);
          notify('slug');
        }
      },
    }),
    text('slug', 'Address', { required: true, readOnly: !isNew, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', patternMessage: 'Lowercase letters, numbers and hyphens only.', hint: isNew ? 'The project’s address: /work/<this>. It can’t be changed later.' : 'The project lives at /work/<this>.' }),
    text('kind', 'Line under the title', { required: true, hint: 'Industry · what was made, e.g. “Healthcare · Brand identity system”.', span: 2 }),
    { key: 'industry', type: 'text', label: 'Industry', required: true, hint: industries.length ? `Used by the work page’s filters. In use: ${industries.join(', ')}.` : 'Used by the work page’s filters.' },
    { key: 'src', type: 'image', folder: 'images/works', label: 'Card picture', required: true, hint: 'A square shot works best; the card crops it to 9:16.' },
    { key: 'focus', type: 'focus', image: 'src', label: 'Focus point', hint: 'Drag the dot onto the subject: the card keeps that point in view.' },
  ];
  return { card, study: studySchema(decks) };
}

export function studySchema(decks) {
  return [
    { type: 'heading', label: 'The case study' },
    area('summary', 'Summary', { rows: 4, required: true, counter: 280, hint: 'Two or three sentences for the title card, in the deck’s own words.' }),
    { key: 'accent', type: 'color', label: 'Accent colour', required: true, hint: 'The brand’s colour, lifted so it reads on the night ground.' },
    {
      key: 'editions',
      type: 'list',
      label: 'Editions',
      hint: 'One per PDF. The pages come from scripts/work/build.py; chapters name the page each part starts on.',
      item: {
        label: 'Edition',
        title: (v) => v.label,
        subtitle: (v) => `${v.deck} · ${decks[v.deck] ?? 0} pages · ${v.chapters?.length ?? 0} chapters`,
        duplicate: false,
        fields: [
          text('label', 'Edition name', { required: true }),
          { key: 'deck', type: 'select', label: 'Rendered deck', options: Object.keys(decks).map((name) => ({ value: name, label: `${name} (${decks[name]} pages)` })) },
          {
            key: 'chapters',
            type: 'list',
            label: 'Chapters',
            item: {
              label: 'Chapter',
              title: (v) => v.title,
              subtitle: (v) => `Page ${v.page}`,
              // The page the chapter opens on, from the deck's rendered pages.
              thumb: (v, edition) => (edition?.deck && Number.isInteger(v.page) ? thumbUrl(`/work/${edition.deck}/${String(v.page).padStart(2, '0')}.webp`) : ''),
              open: false,
              duplicate: false,
              columns: 2,
              fields: [text('title', 'Title', { required: true }), { key: 'page', type: 'number', label: 'Starts on page', integer: true, min: 1, required: true }],
              create: (list) => ({ title: '', page: Math.max(1, ...list.map((c) => c.page ?? 1)) + 1 }),
            },
          },
        ],
        create: () => ({ label: 'Brand guidelines', deck: Object.keys(decks)[0], chapters: [{ title: 'Introduction', page: 1 }] }),
      },
    },
  ];
}

const ICON_HINT = 'A Simple Icons slug (nextdotjs, react, cloudflare…), optional.';

export function systemSchema() {
  return [
    { type: 'heading', label: 'The card' },
    text('title', 'Title', { required: true }),
    text('year', 'Year'),
    text('kind', 'Line under the title', { required: true, span: 2 }),
    text('industry', 'Industry', { required: true }),
    { key: 'platform', type: 'select', label: 'Used on', optional: true, options: [{ value: 'web', label: 'The web (screens in a browser)' }, { value: 'app', label: 'A phone app (screens in a phone)' }] },
    { key: 'accent', type: 'color', label: 'Accent colour', required: true },
    { key: 'live', type: 'nullable', label: 'Has a live address', columns: 2, fields: [{ key: 'href', type: 'url', label: 'Address', required: true }, text('label', 'Shown as', { required: true })], create: () => ({ href: 'https://', label: '' }) },
    { type: 'heading', label: 'The story' },
    area('summary', 'Summary', { rows: 4, required: true, counter: 320 }),
    area('brief', 'The brief', { rows: 4, required: true }),
    { key: 'facts', type: 'list', label: 'Facts', item: { label: 'Fact', title: (v) => v.label, subtitle: (v) => v.value, columns: 2, open: false, fields: [text('label', 'Label', { required: true }), text('value', 'Value', { required: true })], create: () => ({ label: '', value: '' }) } },
    { key: 'figures', type: 'list', label: 'In numbers', item: { label: 'Figure', title: (v) => v.value, subtitle: (v) => v.label, columns: 2, open: false, fields: [text('value', 'Figure', { required: true }), text('label', 'What it counts', { required: true })], create: () => ({ value: '', label: '' }) } },
    { key: 'highlights', type: 'list', label: 'Engineering highlights', item: { label: 'Highlight', title: (v) => v.title, subtitle: (v) => v.detail, open: false, fields: [text('title', 'Title', { required: true }), area('detail', 'Detail', { rows: 3 })], create: () => ({ title: '', detail: '' }) } },
    {
      key: 'journeys',
      type: 'list',
      label: 'User journeys',
      item: {
        label: 'Journey',
        title: (v) => v.actor,
        subtitle: (v) => v.goal,
        open: false,
        fields: [
          text('actor', 'Who', { required: true }),
          text('goal', 'Wants to', { required: true }),
          { key: 'steps', type: 'list', label: 'Steps', item: { label: 'Step', title: (v) => v.title, subtitle: (v) => v.detail, open: false, fields: [text('title', 'Step', { required: true }), area('detail', 'Detail', { rows: 2 })], create: () => ({ title: '', detail: '' }) } },
          area('outcome', 'Outcome', { rows: 2 }),
        ],
        create: () => ({ actor: '', goal: '', steps: [], outcome: '' }),
      },
    },
    { type: 'heading', label: 'Stack' },
    {
      key: 'stack',
      type: 'list',
      label: 'Layers',
      item: {
        label: 'Layer',
        title: (v) => v.layer,
        subtitle: (v) => (v.items ?? []).map((item) => item.name).join(', '),
        open: false,
        fields: [
          text('layer', 'Layer', { required: true }),
          { key: 'items', type: 'list', label: 'Tools', item: { label: 'Tool', title: (v) => v.name, subtitle: (v) => v.detail, open: false, columns: 2, fields: [text('name', 'Name', { required: true }), text('detail', 'Detail', { optional: true }), text('icon', 'Icon', { optional: true, hint: ICON_HINT })], create: () => ({ name: '' }) } },
        ],
        create: () => ({ layer: '', items: [] }),
      },
    },
    { type: 'heading', label: 'Design' },
    group('design', 'Design language', [
      { key: 'palette', type: 'list', label: 'Palette', item: { label: 'Colour', title: (v) => `${v.name} ${v.hex}`, subtitle: (v) => v.role, open: false, columns: 2, fields: [{ key: 'hex', type: 'color', label: 'Colour', required: true }, text('name', 'Name', { required: true }), text('role', 'Role', { span: 2 })], create: () => ({ hex: '#095cfb', name: '', role: '' }) } },
      { key: 'faces', type: 'list', label: 'Typefaces', item: { label: 'Typeface', title: (v) => v.family, subtitle: (v) => v.role, open: false, columns: 2, fields: [text('family', 'Family', { required: true }), text('role', 'Role'), text('sample', 'Sample text', { span: 2 }), text('stack', 'CSS font stack', { span: 2 }), text('google', 'Google Fonts spec', { optional: true }), text('note', 'Note', { optional: true })], create: () => ({ family: '', role: '', sample: '', stack: '' }) } },
      { key: 'notes', type: 'lines', label: 'Principles', itemLabel: 'Principle' },
    ]),
    { type: 'heading', label: 'Advanced' },
    group('architecture', 'Architecture', [{ key: 'tiers', type: 'json', label: 'Tiers', hint: 'Tiers of boxes, left to right: [{ label, nodes: [{ id, label, detail }] }].' }, { key: 'links', type: 'json', label: 'Links', rows: 6, hint: 'Pairs of box ids the light runs between: [["site", "api"], …].' }], { open: false }),
    group('plan', 'Site map', [text('title', 'Title'), { key: 'root', type: 'json', label: 'Tree', hint: '{ label, detail?, children?: [...] }' }], { open: false }),
  ];
}
