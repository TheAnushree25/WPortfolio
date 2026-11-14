import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, png } from './helpers.mjs';

let env;
let owner;

const upload = (client, { folder = 'images', name, data, replace = false }) =>
  client.request('POST', `/api/media/upload?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}${replace ? '&replace=1' : ''}`, { raw: data, headers: { 'content-type': 'application/octet-stream' } });

const onDrafts = (repoPath) => env.github.flatten(env.github.commit(env.github.refs.get('admin-drafts')).tree).get(repoPath);

before(async () => {
  env = await boot();
  owner = env.client();
  await owner.setup();
});
after(() => env.close());

test('the library lists the public folder with where each file is used', async () => {
  const library = await owner.get('/api/media');
  assert.equal(library.status, 200);
  assert.ok(library.data.files.length > 100);
  const card = library.data.files.find((file) => file.path === '/images/works/yooj.jpg');
  assert.ok(card, 'a card picture is listed');
  assert.equal(card.kind, 'image');
  assert.ok(card.used);
  assert.ok(card.usedBy.includes('Site content'));
  assert.deepEqual(library.data.missing, [], 'nothing the site points at is missing');
  assert.ok(library.data.folders.some((folder) => folder.path === '/images/works'));
  const measured = library.data.files.filter((file) => file.kind === 'image' && file.width);
  assert.ok(measured.length > 0, 'pictures are measured');
});

test('uploads are checked by their bytes and committed to the drafts', async () => {
  const mismatch = await upload(owner, { name: 'fake.png', data: Buffer.from('<svg onload=alert(1)>') });
  assert.equal(mismatch.status, 415);
  const svg = await upload(owner, { name: 'logo.svg', data: Buffer.from('<svg/>') });
  assert.equal(svg.status, 415);

  const done = await upload(owner, { name: 'New Hero Shot.PNG', data: png(1200, 630, 1) });
  assert.equal(done.status, 200);
  assert.equal(done.data.path, '/images/new-hero-shot.png', 'names are tidied');
  assert.equal(done.data.width, 1200);
  assert.equal(done.data.height, 630);
  assert.ok(onDrafts('public/images/new-hero-shot.png'));
  assert.match(env.github.commit(env.github.refs.get('admin-drafts')).message, /^Upload \/images\/new-hero-shot\.png/);

  const again = await upload(owner, { name: 'new-hero-shot.png', data: png(10, 10, 2) });
  assert.equal(again.status, 409);
  const replaced = await upload(owner, { name: 'new-hero-shot.png', data: png(10, 10, 2), replace: true });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.data.replaced.reason, 'replaced');
  const trash = await owner.get('/api/media/trash');
  assert.equal(trash.data[0].path, '/images/new-hero-shot.png');
});

test('a new file is previewed from GitHub, the trash keeps the old one', async () => {
  const preview = await owner.get('/site-media/images/new-hero-shot.png');
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(preview.data), png(10, 10, 2));
  const trash = await owner.get('/api/media/trash');
  const old = await owner.get(`/trash-media/${trash.data[0].id}`);
  assert.deepEqual(Buffer.from(old.data), png(1200, 630, 1), 'the replaced picture is still there');
});

test('files the site uses can’t be removed; unused ones go to the trash and come back', async () => {
  const used = await owner.post('/api/media/remove', { path: '/images/works/yooj.jpg' });
  assert.equal(used.status, 409);
  assert.equal(used.data.error, 'in_use');

  const removed = await owner.post('/api/media/remove', { path: '/images/new-hero-shot.png' });
  assert.equal(removed.status, 200);
  assert.equal(onDrafts('public/images/new-hero-shot.png'), undefined);
  const restored = await owner.post(`/api/media/trash/${removed.data.id}/restore`, {});
  assert.equal(restored.status, 200);
  assert.ok(onDrafts('public/images/new-hero-shot.png'));
  assert.equal((await owner.get('/api/media/check?path=/images/new-hero-shot.png')).data.exists, true);
});

test('large files arrive in pieces and are committed as one', async () => {
  const size = 3_500_000 * 2 + 12_345;
  const video = Buffer.alloc(size, 7);
  video.write('ftypisom', 4, 'latin1');
  const started = await owner.post('/api/media/uploads', { folder: 'video', name: 'Studio Reel.mp4', size });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  assert.equal(started.data.chunks, 3);
  const { id, chunkSize } = started.data;
  const wrong = await owner.request('PUT', `/api/media/uploads/${id}/0`, { raw: video.subarray(0, 10), headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(wrong.status, 400, 'a piece of the wrong size is refused');
  for (let index = 0; index < 3; index++) {
    const piece = video.subarray(index * chunkSize, Math.min(size, (index + 1) * chunkSize));
    const put = await owner.request('PUT', `/api/media/uploads/${id}/${index}`, { raw: piece, headers: { 'content-type': 'application/octet-stream' } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
  }
  const finished = await owner.post(`/api/media/uploads/${id}/finish`, {});
  assert.equal(finished.status, 200, JSON.stringify(finished.data));
  assert.equal(finished.data.path, '/video/studio-reel.mp4');
  assert.equal(onDrafts('public/video/studio-reel.mp4').size, size);
  assert.equal((await owner.post(`/api/media/uploads/${id}/finish`, {})).status, 404, 'the pieces are gone once committed');

  const tooBig = await owner.post('/api/media/uploads', { folder: 'video', name: 'huge.mp4', size: 200e6 });
  assert.equal(tooBig.status, 413);
});

test('a discarded new file waits in the trash', async () => {
  const discarded = await owner.post('/api/publish/discard', { file: 'public/video/studio-reel.mp4' });
  assert.equal(discarded.status, 200, JSON.stringify(discarded.data));
  assert.equal(onDrafts('public/video/studio-reel.mp4'), undefined);
  const trash = await owner.get('/api/media/trash');
  assert.equal(trash.data[0].path, '/video/studio-reel.mp4');
  assert.equal(trash.data[0].reason, 'discarded');
});

test('viewers can look but not upload; only owners empty the trash', async () => {
  const made = await owner.post('/api/users', { name: 'Vi', email: 'vi@atlas.test', role: 'viewer' });
  const viewer = env.client({ ip: '203.0.113.77' });
  await viewer.login('vi@atlas.test', made.data.password);
  await viewer.post('/api/auth/password', { current: made.data.password, next: 'cobalt-meadow-drift-31' });
  assert.equal((await viewer.get('/api/media')).status, 200);
  assert.equal((await upload(viewer, { name: 'x.png', data: png() })).status, 403);
  const trash = await owner.get('/api/media/trash');
  assert.equal((await viewer.delete(`/api/media/trash/${trash.data[0].id}`)).status, 403);
  assert.equal((await owner.delete(`/api/media/trash/${trash.data[0].id}`)).status, 200);
});

test('an unchanged file is shown from the live site when its address is known', async () => {
  const live = await boot({ env: { SITE_URL: 'https://theatlasstudios.vercel.app' } });
  try {
    const client = live.client();
    await client.setup();
    const redirected = await client.get('/site-media/images/works/yooj.jpg');
    assert.equal(redirected.status, 302);
    assert.equal(redirected.headers.get('location'), 'https://theatlasstudios.vercel.app/images/works/yooj.jpg');
    assert.match(redirected.headers.get('content-security-policy'), /img-src 'self' data: blob: https:\/\/theatlasstudios\.vercel\.app/);
  } finally {
    await live.close();
  }
});
