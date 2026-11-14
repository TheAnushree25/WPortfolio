import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.mjs';

let env;
let owner;

const fileOn = async (branch, file) => {
  const head = env.github.refs.get(branch);
  const entry = env.github.flatten(env.github.commit(head).tree).get(file);
  return entry ? (await env.github.blob(entry.sha)).toString('utf8') : null;
};

before(async () => {
  env = await boot();
  owner = env.client();
  await owner.setup();
});
after(() => env.close());

test('sections are read from the live branch while nothing is waiting', async () => {
  const list = await owner.get('/api/content');
  assert.equal(list.status, 200);
  assert.ok(list.data.some((section) => section.id === 'testimonials'));
  assert.ok(!list.data.some((section) => section.hidden));
  const studio = await owner.get('/api/content/studio');
  assert.equal(studio.status, 200);
  assert.ok(studio.data.value.name);
  assert.match(studio.data.version, /^[0-9a-f]{12}$/);
  assert.equal(env.github.refs.has('admin-drafts'), false, 'reading creates nothing');
});

test('a save is one commit on the drafts, written with the smallest edit, and the live branch is untouched', async () => {
  const liveBefore = env.github.refs.get('main');
  const section = await owner.get('/api/content/testimonials');
  const value = structuredClone(section.data.value);
  value.cards[0].quote = 'Atlas understood our brand before we did.';
  const saved = await owner.put('/api/content/testimonials', { value, version: section.data.version });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.value.cards[0].quote, 'Atlas understood our brand before we did.');
  assert.notEqual(saved.data.version, section.data.version);

  assert.equal(env.github.refs.get('main'), liveBefore, 'the live site is unchanged until publishing');
  const draft = env.github.commit(env.github.refs.get('admin-drafts'));
  assert.match(draft.message, /^Edit Testimonials from the admin/);
  assert.equal(draft.author.name, 'Gulafsan Shaheen', 'the commit is in the editor’s name');
  const before = await fileOn('main', 'src/content/site.ts');
  const after = await fileOn('admin-drafts', 'src/content/site.ts');
  const changed = after.split('\n').filter((line, index) => line !== before.split('\n')[index]);
  assert.equal(changed.length, 1, 'only the one line holding the quote changed');
  assert.match(changed[0], /Atlas understood our brand before we did\./);

  const again = await owner.get('/api/content/testimonials');
  assert.equal(again.data.value.cards[0].quote, 'Atlas understood our brand before we did.', 'the admin now reads the drafts');
});

test('a stale form is refused rather than overwriting, and rules guard the build', async () => {
  const section = await owner.get('/api/content/testimonials');
  const stale = await owner.put('/api/content/testimonials', { value: section.data.value, version: '000000000000' });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error, 'conflict');

  const works = await owner.get('/api/content/works');
  const broken = structuredClone(works.data.value);
  broken.projects[0].src = '/images/works/not-there.jpg';
  const refused = await owner.put('/api/content/works', { value: broken, version: works.data.version });
  assert.equal(refused.status, 422);
  assert.match(refused.data.message, /isn’t in the public folder/);
});

test('the publish page lists the waiting change with its diff', async () => {
  const page = await owner.get('/api/publish');
  assert.equal(page.status, 200);
  assert.equal(page.data.mode, 'hosted');
  assert.equal(page.data.repo.live, 'main');
  assert.equal(page.data.repo.draft, 'admin-drafts');
  assert.deepEqual(page.data.changes.map((change) => change.file), ['src/content/site.ts']);
  assert.equal(page.data.changes[0].label, 'Site content');
  const diff = await owner.get('/api/publish/diff?file=src/content/site.ts');
  assert.equal(diff.data.binary, false);
  assert.match(diff.data.diff, /^\+.*Atlas understood our brand/m);
  assert.match(diff.data.diff, /^@@ /m);
  const badges = await owner.get('/api/badges');
  assert.equal(badges.data.changes, 1);
});

test('code pushed to the live branch meanwhile is brought into the drafts, not lost', async () => {
  env.github.commitFiles('main', { 'README.md': '# Changed by a developer\n' }, { message: 'Developer: update the readme' });
  const section = await owner.get('/api/content/story');
  const value = structuredClone(section.data.value);
  const key = Object.keys(value).find((name) => typeof value[name] === 'string' && value[name].length > 3);
  value[key] = `${value[key]} (edited)`;
  const saved = await owner.put('/api/content/story', { value, version: section.data.version });
  assert.equal(saved.status, 200);
  assert.equal(await fileOn('admin-drafts', 'README.md'), '# Changed by a developer\n', 'the drafts took in the developer’s commit');
  const page = await owner.get('/api/publish');
  assert.deepEqual(page.data.changes.map((change) => change.file), ['src/content/site.ts'], 'only the admin’s own edits are listed');
});

test('two saves at the same moment both land', async () => {
  const [nav, practice] = await Promise.all([owner.get('/api/content/nav'), owner.get('/api/content/practice')]);
  const navValue = structuredClone(nav.data.value);
  const practiceValue = structuredClone(practice.data.value);
  const navKey = Object.keys(navValue).find((name) => typeof navValue[name] === 'string');
  const practiceKey = Object.keys(practiceValue).find((name) => typeof practiceValue[name] === 'string');
  navValue[navKey] = `${navValue[navKey]}!`;
  practiceValue[practiceKey] = `${practiceValue[practiceKey]}!`;
  const [a, b] = await Promise.all([owner.put('/api/content/nav', { value: navValue, version: nav.data.version }), owner.put('/api/content/practice', { value: practiceValue, version: practice.data.version })]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal((await owner.get('/api/content/nav')).data.value[navKey], navValue[navKey]);
  assert.equal((await owner.get('/api/content/practice')).data.value[practiceKey], practiceValue[practiceKey]);
});

test('a change can be put back as it is live', async () => {
  const seo = await owner.get('/api/content/seo');
  const value = structuredClone(seo.data.value);
  value.description = `${value.description} Temporary.`;
  assert.equal((await owner.put('/api/content/seo', { value, version: seo.data.version })).status, 200);
  assert.ok((await owner.get('/api/publish')).data.changes.some((change) => change.file === 'src/app/layout.tsx'));
  const discarded = await owner.post('/api/publish/discard', { file: 'src/app/layout.tsx' });
  assert.equal(discarded.status, 200);
  assert.equal(await fileOn('admin-drafts', 'src/app/layout.tsx'), await fileOn('main', 'src/app/layout.tsx'));
  assert.ok(!(await owner.get('/api/publish')).data.changes.some((change) => change.file === 'src/app/layout.tsx'));
  assert.equal((await owner.post('/api/publish/discard', { file: 'package.json' })).status, 403, 'only content and media');
});

test('earlier versions are listed and one can be restored', async () => {
  const backups = await owner.get('/api/content-backups');
  assert.equal(backups.status, 200);
  const entry = backups.data.find((item) => item.path === 'src/content/site.ts');
  assert.ok(entry, 'the drafts’ history is the backup');
  assert.match(entry.name, /^[0-9a-f]{40}$/);
  const restored = await owner.post('/api/content-backups/restore', { file: entry.file, name: entry.name });
  assert.equal(restored.status, 200);
  assert.match(env.github.commit(env.github.refs.get('admin-drafts')).message, /^Restore src\/content\/site\.ts/);
});

test('cards can be archived and restored', async () => {
  const projects = await owner.get('/api/projects');
  assert.equal(projects.status, 200);
  assert.ok(projects.data.design.length > 3);
  assert.ok(projects.data.systems.length > 0);
  const slug = projects.data.design.at(-1).slug;
  assert.equal((await owner.post(`/api/projects/design/${slug}/archive`, {})).status, 200);
  const after = await owner.get('/api/projects');
  assert.ok(!after.data.design.some((card) => card.slug === slug));
  assert.equal(after.data.archived[0].card.slug, slug);
  assert.equal((await owner.post('/api/projects/design/restore', { slug })).status, 200);
  assert.equal((await owner.get('/api/projects')).data.design.at(-1).slug, slug);
});

test('publishing puts everything waiting onto the live branch as one commit, and the drafts start again', async () => {
  const liveBefore = env.github.refs.get('main');
  const refused = await owner.post('/api/publish/release', { confirm: 'yes' });
  assert.equal(refused.status, 400);
  const published = await owner.post('/api/publish/release', { confirm: 'publish', message: 'New testimonial and story line' });
  assert.equal(published.status, 200);
  const live = env.github.commit(env.github.refs.get('main'));
  assert.deepEqual(live.parents, [liveBefore], 'one commit on top of the live branch');
  assert.match(live.message, /^New testimonial and story line/);
  assert.match(await fileOn('main', 'src/content/site.ts'), /Atlas understood our brand before we did\./);
  assert.equal(env.github.refs.get('admin-drafts'), env.github.refs.get('main'), 'the drafts start again from the live site');
  const page = await owner.get('/api/publish');
  assert.equal(page.data.changes.length, 0);
  assert.equal((await owner.post('/api/publish/release', { confirm: 'publish' })).status, 400, 'nothing left to publish');
  const log = await owner.get('/api/activity?category=publish');
  assert.ok(log.data.items.some((item) => item.action === 'publish.release'));
});

test('only owners publish, and the health review runs on the hosted site', async () => {
  const health = await owner.get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(typeof health.data.score, 'number');
  assert.ok(!health.data.checks.some((check) => check.id === 'packages'), 'no packages to install on a hosted admin');
  const made = await owner.post('/api/users', { name: 'Ed', email: 'ed@atlas.test', role: 'editor' });
  const editor = env.client({ ip: '203.0.113.90' });
  await editor.login('ed@atlas.test', made.data.password);
  await editor.post('/api/auth/password', { current: made.data.password, next: 'amber-harbour-silent-77' });
  assert.equal((await editor.post('/api/publish/release', { confirm: 'publish' })).status, 403);
});
