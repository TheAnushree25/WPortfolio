import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { computedPaths, literalValue, parseModule } from '../server/content/parse.mjs';
import { evaluateModule } from '../server/content/evaluate.mjs';
import { clean, rewriteSource, serialize } from '../server/content/rewrite.mjs';

/**
 * The content engine against the site's real files, read-only: every edit
 * here happens on a string in memory. Each test checks the value that comes
 * back out of the rewritten source, and that nothing else in the file moved.
 */

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(siteRoot, file), 'utf8');
const SITE = read('src/content/site.ts');
const WORK = read('src/content/work.ts');
const SYSTEMS = read('src/content/systems.ts');
const LAYOUT = read('src/app/layout.tsx');

const valuesOf = (src) => evaluateModule(src, parseModule(src));
/** The files are checked out with CRLF on Windows; text checks compare with LF. */
const lf = (text) => text.replace(/\r\n/g, '\n');
const changedLines = (a, b) => {
  const left = a.split('\n');
  const right = b.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) if (left[i] !== right[i]) out.push(i + 1);
  return out;
};
const edit = (src, name, change, options) => {
  const before = (options?.only ? null : valuesOf(src)) ?? {};
  const next = structuredClone(before[name] ?? literalValue(parseModule(src, options).decls.get(name).init, parseModule(src, options)));
  change(next);
  const { source, changed } = rewriteSource(src, name, next, options);
  return { source, changed, next };
};

test('reads every export in the content files, and the literal reading agrees with running the file', () => {
  for (const src of [SITE, WORK, SYSTEMS]) {
    const mod = parseModule(src);
    const values = evaluateModule(src, mod);
    assert.ok(values, 'the file evaluates');
    for (const [name, decl] of mod.decls) {
      if (!decl.init) continue;
      const locked = computedPaths(decl.init, mod).map((p) => p.join('.'));
      if (locked.length === 0) assert.deepEqual(clean(literalValue(decl.init, mod)), values[name], `${name} reads the same both ways`);
    }
  }
  const site = parseModule(SITE);
  assert.deepEqual(
    [...site.decls.keys()],
    ['site', 'nav', 'hero', 'works', 'worksPage', 'practice', 'story', 'partners', 'method', 'testimonials', 'footer', 'nextPage', 'deck', 'booking'],
  );
});

test('finds the values that are worked out from others', () => {
  const mod = parseModule(SITE);
  const paths = (name) => computedPaths(mod.decls.get(name).init, mod).map((p) => p.join('.'));
  assert.deepEqual(paths('hero'), ['wordmark']);
  assert.ok(paths('footer').includes('links.2.href'));
  assert.ok(paths('footer').includes('legal.lines.1'));
  assert.ok(paths('footer').includes('email'));
  assert.deepEqual(paths('deck'), ['slides']);
  assert.deepEqual(paths('testimonials'), []);
});

test('reads the metadata in layout.tsx without reading its JSX', () => {
  const mod = parseModule(LAYOUT, { only: ['metadata', 'viewport'] });
  const metadata = literalValue(mod.decls.get('metadata').init, mod);
  assert.equal(metadata.title, 'Atlas Studios — Gulafsan Shaheen');
  assert.equal(metadata.openGraph.type, 'website');
  assert.equal(literalValue(mod.decls.get('viewport').init, mod).themeColor, '#020923');
});

test('an unchanged value writes nothing', () => {
  for (const [src, names] of [
    [SITE, ['site', 'works', 'footer', 'testimonials', 'booking']],
    [WORK, ['studies']],
    [SYSTEMS, ['systems', 'systemOrder']],
  ]) {
    const values = valuesOf(src);
    for (const name of names) assert.equal(rewriteSource(src, name, structuredClone(values[name])).changed, false, name);
  }
});

test('changing one string changes one line', () => {
  const { source, next } = edit(SITE, 'testimonials', (t) => {
    t.cards[1].name = 'Riya Kapoor';
  });
  assert.deepEqual(changedLines(SITE, source).length, 1);
  assert.deepEqual(valuesOf(source).testimonials, clean(next));
  assert.ok(lf(source).includes("name: 'Riya Kapoor',"));
});

test('quotes, apostrophes, backslashes, new lines and emoji survive the round trip', () => {
  const tricky = 'It\'s "quoted", a back\\slash, a\nnew line, a tab\t, and ✨ ‘curly’ — all of it';
  const { source } = edit(SITE, 'story', (s) => {
    s.paragraphs[0] = tricky;
  });
  assert.equal(valuesOf(source).story.paragraphs[0], tricky);
  assert.equal(changedLines(SITE, source).length, 1);
});

test('moving a card keeps every card’s own line', () => {
  const { source, next } = edit(SITE, 'works', (w) => {
    w.projects.forEach((p, i) => (p.__i = i));
    w.projects.unshift(w.projects.pop());
  });
  assert.deepEqual(valuesOf(source).works, clean(next));
  const before = SITE.split('\n').filter((line) => line.includes("{ slug: '")).sort();
  const after = source.split('\n').filter((line) => line.includes("{ slug: '")).sort();
  assert.deepEqual(after, before, 'the same lines, in a different order');
  assert.ok(source.indexOf("slug: 'freighteasy'") < source.indexOf("slug: 'yooj'"));
});

test('a moved card that is also edited is still recognised by its __i', () => {
  const { source, next } = edit(SITE, 'works', (w) => {
    w.projects.forEach((p, i) => (p.__i = i));
    const [teddy] = w.projects.splice(5, 1);
    teddy.title = 'Teddy Cider';
    teddy.kind = 'Hard cider · Label & campaign';
    w.projects.splice(1, 0, teddy);
  });
  assert.deepEqual(valuesOf(source).works, clean(next));
  assert.ok(lf(source).includes("{ slug: 'teddy', title: 'Teddy Cider', kind: 'Hard cider · Label & campaign', src: '/images/works/teddy.jpg', focus: '10% 50%', industry: 'Drinks' },"));
});

test('a new item is written in the style of its neighbours', () => {
  const { source, next } = edit(SITE, 'works', (w) => {
    w.projects.push({ slug: 'monsoon', title: 'Monsoon', kind: 'Tea · Packaging', src: '/images/works/teddy.jpg', focus: '50% 50%', industry: 'Drinks' });
  });
  assert.deepEqual(valuesOf(source).works, clean(next));
  assert.ok(lf(source).includes("    { slug: 'monsoon', title: 'Monsoon', kind: 'Tea · Packaging', src: '/images/works/teddy.jpg', focus: '50% 50%', industry: 'Drinks' },\n  ],"));

  const added = edit(SITE, 'testimonials', (t) => {
    t.cards.push({ quote: 'They listened first.', name: 'Asha Rao', role: 'Founder — Mistiwork', initials: 'AR' });
  });
  assert.deepEqual(valuesOf(added.source).testimonials, clean(added.next));
  assert.match(lf(added.source), /\{\n {6}quote: 'They listened first\.',\n {6}name: 'Asha Rao',\n {6}role: 'Founder — Mistiwork',\n {6}initials: 'AR',\n {4}\},\n {2}\],/);
});

test('removing items leaves the rest untouched', () => {
  const { source, next } = edit(SITE, 'partners', (p) => {
    p.logos.splice(3, 1);
    p.logos.pop();
  });
  assert.deepEqual(valuesOf(source).partners, clean(next));
  assert.ok(!lf(source).includes('mistiwork.png'));
  assert.ok(!lf(source).includes('workers-bees.png'));
  assert.ok(lf(source).includes("{ name: 'Wat’a’melon', src: '/images/partners/watamelon.png', width: 371, height: 324 },\n  ],"));
});

test('a list next to a worked-out item can still be edited, and the worked-out item is kept as written', () => {
  const { source, next } = edit(SITE, 'footer', (f) => {
    f.legal.lines[2] = 'Hosted by Cloudflare, Inc. (cloudflare.com).';
  });
  assert.deepEqual(valuesOf(source).footer, clean(next));
  assert.ok(lf(source).includes('`Contact: ${site.email}`,'));
  assert.equal(changedLines(SITE, source).length, 1);

  const grown = edit(SITE, 'footer', (f) => {
    f.legal.lines.forEach((line, i) => (f.legal.lines[i] = line));
    f.legal.lines.push('Photography by the studio.');
  });
  assert.deepEqual(valuesOf(grown.source).footer, clean(grown.next));
  assert.ok(lf(grown.source).includes('`Contact: ${site.email}`,'));
});

test('editing a worked-out value is refused, and says which', () => {
  assert.throws(
    () =>
      edit(SITE, 'footer', (f) => {
        f.email = 'someone@else.com';
      }),
    (error) => error.code === 'computed' && /footer › email/.test(error.message),
  );
});

test('a change to the studio email flows into the values that follow it', () => {
  const { source } = edit(SITE, 'site', (s) => {
    s.email = 'hello@theatlasstudio.com';
  });
  const values = valuesOf(source);
  assert.equal(values.footer.email, 'hello@theatlasstudio.com');
  assert.equal(values.footer.contact.line.href, 'mailto:hello@theatlasstudio.com');
  assert.equal(changedLines(SITE, source).length, 1);
});

test('adding and removing keys in an object', () => {
  const { source, next } = edit(LAYOUT, 'metadata', (m) => {
    m.openGraph.images = ['/images/atlas-intro-poster.jpg'];
    m.description = 'A shorter description.';
  }, { only: ['metadata', 'viewport'] });
  const mod = parseModule(source, { only: ['metadata'] });
  assert.deepEqual(literalValue(mod.decls.get('metadata').init, mod), clean(next));
  assert.ok(lf(source).includes("    type: 'website',\n    images: ['/images/atlas-intro-poster.jpg'],\n  },"));
  assert.ok(lf(source).includes('export default function RootLayout'), 'the JSX after it is untouched');

  const removed = edit(SITE, 'booking', (b) => {
    delete b.taken;
  });
  assert.deepEqual(valuesOf(removed.source).booking, clean(removed.next));
  assert.ok(!lf(removed.source).includes("taken: 'Booked',"));
});

test('an edit to a system lands in that system’s own const', () => {
  const { source, next } = edit(SYSTEMS, 'systems', (s) => {
    s.keeri.summary = 'A new summary for Keeri.';
    s['maple-furnishers'].figures[0].value = '2,000';
  });
  assert.deepEqual(valuesOf(source).systems, clean(next));
  assert.match(lf(source), /summary:\s+'A new summary for Keeri\.',/);
  assert.ok(lf(source).includes("export const systems: Record<string, SystemStudy> = {\n  'maple-furnishers': furnishers,"), 'the record still points at the consts');
  assert.equal(changedLines(SYSTEMS, source).length, 2);
});

test('reordering the system order, an `as const` list of slugs', () => {
  const { source, next } = edit(SYSTEMS, 'systemOrder', (order) => {
    order.reverse();
  });
  assert.deepEqual(valuesOf(source).systemOrder, clean(next));
  assert.ok(lf(source).includes("export const systemOrder = ['saaj', 'ishita-traders', 'keeri', 'shoku', 'maple-studios', 'maple-furnishers'] as const;"));
});

test('chapters: moved, edited, added and removed in one save', () => {
  const { source, next } = edit(WORK, 'studies', (studies) => {
    const chapters = studies.kidcity.editions[0].chapters;
    chapters.forEach((c, i) => (c.__i = i));
    chapters[0].title = 'Hello, Kidcity';
    chapters.splice(4, 1);
    chapters.push({ title: 'Merchandise', page: 14 });
    [chapters[1], chapters[2]] = [chapters[2], chapters[1]];
  });
  assert.deepEqual(valuesOf(source).studies, clean(next));
  assert.ok(lf(source).includes("{ title: 'Hello, Kidcity', page: 1 },"));
  assert.ok(lf(source).includes("{ title: 'Merchandise', page: 14 },"));
  assert.ok(!lf(source).includes("{ title: 'Objects to play with', page: 10 },"));
});

test('serialises new values in the codebase’s style', () => {
  assert.equal(serialize({ title: 'A', page: 2 }), "{ title: 'A', page: 2 }");
  assert.equal(serialize(["it's"]), '["it\'s"]');
  assert.equal(serialize({ 'fresh-feast': { a: [1, 2] } }, '  '), "{\n    'fresh-feast': {\n      a: [1, 2],\n    },\n  }");
});

test('keeps CRLF files CRLF and LF files LF', () => {
  const crlf = lf(SITE).replace(/\n/g, '\r\n');
  const { source } = edit(crlf, 'testimonials', (t) => {
    t.label = 'Kind words';
    t.cards.push({ quote: 'New.', name: 'A B', role: 'C', initials: 'AB' });
  });
  assert.ok(!/[^\r]\n/.test(source), 'no bare line feeds');
  assert.ok(!source.includes('\r\r'), 'no doubled carriage returns');
  assert.equal(valuesOf(lf(source)).testimonials.label, 'Kind words');

  const unix = edit(lf(SITE), 'testimonials', (t) => {
    t.cards.push({ quote: 'New.', name: 'A B', role: 'C', initials: 'AB' });
  });
  assert.ok(!unix.source.includes('\r'), 'no carriage returns added');
});
