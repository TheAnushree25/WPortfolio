import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot } from './helpers.mjs';
import { standinFetch } from '../../Admin/test/research-standin.mjs';
import { findBrowser } from '../../Admin/server/research/pdf.mjs';

/**
 * The Details page on the hosted backend: keys sealed in the database, a
 * run moved one step per look (as a serverless function must), review,
 * writing, previews, PDFs and the daily clean-up. Gemini, Tavily and SerpApi
 * are stand-ins (Admin/test/research-standin.mjs).
 */

let env;
let owner;
let standin;

before(async () => {
  standin = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const response = await standinFetch(`http://127.0.0.1${req.url}`, { method: req.method, body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined });
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') });
      res.end(Buffer.from(await response.arrayBuffer()));
    });
  });
  await new Promise((resolve) => standin.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${standin.address().port}`;
  Object.assign(process.env, { RESEARCH_GEMINI_BASE: `${base}/gemini/v1beta`, RESEARCH_TAVILY_BASE: `${base}/tavily`, RESEARCH_SERPAPI_BASE: `${base}/serpapi` });
  env = await boot();
  owner = env.client();
  assert.equal((await owner.setup()).status, 200);
});

after(async () => {
  await env.close();
  standin.close();
  for (const key of ['RESEARCH_GEMINI_BASE', 'RESEARCH_TAVILY_BASE', 'RESEARCH_SERPAPI_BASE']) delete process.env[key];
});

/** Looks at the run until it reaches one of `statuses`; each look is one step, as on Vercel. */
async function until(id, statuses) {
  let run;
  for (let look = 0; look < 80; look++) {
    // The pause the service leaves between Gemini requests is skipped here.
    await env.db.query(`UPDATE research_runs SET data = jsonb_set(data, '{notBefore}', 'null'::jsonb) WHERE id = $1`, [id]);
    run = (await owner.get(`/api/research/${id}`)).data;
    if (statuses.includes(run.status)) return run;
  }
  throw new Error(`The run stayed at ${run.status} (${run.stage}): ${run.error || run.log.at(-1)?.text}`);
}

test('keys are sealed in the database and never sent back', async () => {
  const saved = await owner.patch('/api/research/settings', { geminiKey: 'gemini-standin-key-0001', tavilyKey: 'tavily-standin-key-0001', serpapiKey: 'serpapi-standin-key-0001' });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.gemini.connected, true);
  assert.ok(!JSON.stringify(saved.data).includes('standin-key'));
  const row = await env.db.one(`SELECT value FROM meta WHERE key = 'research'`);
  assert.match(row.value.geminiKey, /^v1\./, 'sealed with ADMIN_SECRET');
  assert.ok(!JSON.stringify(row.value).includes('standin-key'));
  const tested = await owner.post('/api/research/settings/test', {});
  assert.equal(tested.data.gemini.ok, true, tested.data.gemini.message);
  assert.equal(tested.data.serpapi.left, 248);
});

test('a run moves one step per look, then the documents are written and served', async () => {
  const started = await owner.post('/api/research', { business: 'Sunrise Clinic (test)', city: 'Testpur', phones: '90000 11111', person: 'Dr. Test Person', role: 'Director', industry: 'hospital' });
  assert.equal(started.status, 200, started.data?.message);
  const review = await until(started.data.id, ['review', 'failed']);
  assert.equal(review.status, 'review', review.error);
  assert.ok(review.facts.some((fact) => /20 beds/.test(fact.text) && fact.include));
  assert.ok(review.facts.find((fact) => /helipad/.test(fact.text)).include === false, 'the invented fact is left out');

  const edited = await owner.patch(`/api/research/${review.id}/facts`, { changes: [{ id: review.facts[0].id, include: false }] });
  assert.equal(edited.data.facts[0].include, false);

  assert.equal((await owner.post(`/api/research/${review.id}/write`, {})).status, 200);
  const ready = await until(review.id, ['ready', 'failed']);
  assert.equal(ready.status, 'ready', ready.error);
  assert.equal(ready.documents.summary.offers[0].code, 'A');

  const list = await owner.get('/api/research');
  assert.ok(list.data.items.some((item) => item.id === ready.id && item.ready && item.business === 'Sunrise Clinic (test)'));

  const preview = await owner.get(`/api/research/${ready.id}/preview/summary`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-security-policy'), /sandbox/);
  assert.match(preview.data, /Sunrise Clinic \(test\): the lead and the pitch/);
  const printable = await owner.get(`/api/research/${ready.id}/preview/onepager?print=1`);
  assert.match(printable.data, /Save as PDF/);

  if (findBrowser()) {
    const pdf = await owner.get(`/api/research/${ready.id}/pdf/onepager`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(pdf.headers.get('content-disposition'), /Sunrise-Clinic-test-Online-Health-Check\.pdf/);
  }
});

test('the daily schedule deletes research older than the days kept', async () => {
  await owner.patch('/api/research/settings', { keepDays: 7 });
  const example = (await owner.post('/api/research/example', {})).data;
  await env.db.query(`UPDATE research_runs SET created_at = now() - interval '30 days' WHERE id = $1`, [example.id]);
  const cron = await owner.get('/api/cron/daily', { headers: { authorization: 'Bearer cron-secret-for-tests' } });
  assert.equal(cron.status, 200);
  assert.equal(cron.data.research.removed, 1);
  assert.equal((await owner.get(`/api/research/${example.id}`)).status, 404);
});

test('a viewer can read research but not start or change it', async () => {
  const invite = await owner.post('/api/users', { name: 'Viewer', email: 'viewer@atlas.test', role: 'viewer' });
  assert.equal(invite.status, 200);
  const viewer = env.client({ ip: '203.0.113.44' });
  const login = await viewer.login('viewer@atlas.test', invite.data.password);
  assert.equal(login.status, 200);
  // A new account chooses its own password before anything else.
  assert.equal((await viewer.post('/api/auth/password', { current: invite.data.password, next: 'quiet-orchard-lamp-58' })).status, 200);
  assert.equal((await viewer.get('/api/research')).status, 200);
  assert.equal((await viewer.post('/api/research', { business: 'X', city: 'Y' })).status, 403);
  assert.equal((await viewer.get('/api/research/settings')).status, 403);
});
