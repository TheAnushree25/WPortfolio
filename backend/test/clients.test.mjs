import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot, Client } from './helpers.mjs';

let env;
let owner;
let calendly;
let calendlyBase;

/** Calendly's API, as much of it as the sync reads. */
function startCalendly() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, calendlyBase);
    const send = (body) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== 'Bearer calendly-token-0123456789abcdef') {
      res.writeHead(401);
      return res.end('{}');
    }
    if (url.pathname === '/users/me') return send({ resource: { uri: `${calendlyBase}/users/me1`, name: 'The Atlas Studio', email: 'contact.theatlasstudio@gmail.com', scheduling_url: 'https://calendly.com/theatlasstudio' } });
    if (url.pathname === '/scheduled_events') {
      const start = new Date(Date.now() + 3 * 86_400_000);
      return send({
        collection: [{ uri: `${calendlyBase}/scheduled_events/ev1`, name: 'Discussion Meeting', start_time: start.toISOString(), end_time: new Date(start.getTime() + 45 * 60_000).toISOString(), status: 'active', location: { type: 'google_conference', join_url: 'https://meet.google.com/abc-defg-hij' } }],
        pagination: { next_page: null },
      });
    }
    if (url.pathname === '/scheduled_events/ev1/invitees') return send({ collection: [{ name: 'Riya Kapoor', email: 'riya@kapoor.example', status: 'active', questions_and_answers: [{ question: 'Anything we should know?', answer: 'A rebrand for our tea company.' }] }] });
    res.writeHead(404);
    res.end('{}');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

before(async () => {
  calendly = await startCalendly();
  calendlyBase = `http://127.0.0.1:${calendly.address().port}`;
  env = await boot({ env: { CALENDLY_API_BASE: calendlyBase, SITE_ORIGINS: 'https://theatlasstudios.vercel.app' } });
  owner = env.client();
  await owner.setup();
});
after(async () => {
  await env.close();
  await new Promise((resolve) => calendly.close(resolve));
});

test('enquiries: add, move through the pipeline with notes, archive, export', async () => {
  const added = await owner.post('/api/enquiries', { name: 'Kabir Sethi', email: 'Kabir@Ledgerly.example', company: 'Ledgerly', service: 'Website', budget: '₹5L+', value: 650000, tags: ['priority'], message: '=HYPERLINK("http://evil")' });
  assert.equal(added.status, 200);
  assert.equal(added.data.email, 'kabir@ledgerly.example');
  const id = added.data.id;
  const moved = await owner.patch(`/api/enquiries/${id}`, { status: 'proposal' });
  assert.equal(moved.data.status, 'proposal');
  assert.equal(moved.data.notes.at(-1).kind, 'status');
  const noted = await owner.post(`/api/enquiries/${id}/notes`, { text: 'Sent the proposal.' });
  assert.equal(noted.data.notes.at(-1).text, 'Sent the proposal.');
  const list = await owner.get('/api/enquiries?q=ledgerly');
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.totals.pipeline, 650000);
  const csv = await owner.get('/api/enquiries-export');
  assert.equal(csv.status, 200);
  assert.match(csv.data, /'=HYPERLINK/, 'a formula is defused in the spreadsheet');
  assert.equal((await owner.patch(`/api/enquiries/${id}`, { archived: true })).data.archived, true);
  assert.equal((await owner.get('/api/enquiries')).data.items.length, 0);
  assert.equal((await owner.get('/api/enquiries?archived=1')).data.items.length, 1);
  const found = await owner.get('/api/search?q=kabir');
  assert.ok(found.data.results.some((result) => result.type === 'Enquiry'));
});

test('the site’s form posts enquiries: allowed origins only, bots ignored, the studio emailed', async () => {
  await owner.patch('/api/settings', { notifyEmail: 'studio@atlas.test' });
  const site = new Client(env.backend, { origin: 'https://studio.test', headers: { origin: 'https://theatlasstudios.vercel.app' }, ip: '198.51.100.20' });
  const sent = await site.post('/api/public/enquiry', { name: 'Meera Nair', email: 'meera@tidewater.example', company: 'Tidewater Stays', service: 'Website', message: 'Boutique homestays in Kerala.' });
  assert.equal(sent.status, 200);
  assert.equal(sent.headers.get('access-control-allow-origin'), 'https://theatlasstudios.vercel.app');
  const mail = env.mails.at(-1);
  assert.deepEqual(mail.to, ['studio@atlas.test']);
  assert.equal(mail.replyTo, 'meera@tidewater.example', 'replying writes back to the visitor');
  assert.match(mail.subject, /New enquiry from Meera Nair \(Tidewater Stays\)/);
  assert.match(mail.html, /Boutique homestays in Kerala\./);

  const again = await site.post('/api/public/enquiry', { name: 'Meera Nair', email: 'MEERA@tidewater.example', message: 'Also a logo, please.' });
  assert.equal(again.status, 200);
  const enquiries = (await owner.get('/api/enquiries?q=meera')).data.items;
  assert.equal(enquiries.length, 1, 'writing again adds a note, not a second enquiry');
  assert.match(enquiries[0].notes.at(-1).text, /Also a logo, please\./);

  const bot = await site.post('/api/public/enquiry', { name: 'Bot', email: 'bot@spam.example', website_url: 'http://spam' });
  assert.equal(bot.status, 200);
  assert.equal((await owner.get('/api/enquiries?q=bot')).data.items.length, 0);

  const foreign = new Client(env.backend, { origin: 'https://studio.test', headers: { origin: 'https://evil.example' }, ip: '198.51.100.21' });
  assert.equal((await foreign.post('/api/public/enquiry', { name: 'X', email: 'x@x.example' })).status, 403);

  const flood = new Client(env.backend, { origin: 'https://studio.test', headers: { origin: 'https://theatlasstudios.vercel.app' }, ip: '198.51.100.22' });
  for (let i = 0; i < 5; i++) await flood.post('/api/public/enquiry', { name: `P${i}`, email: `p${i}@flood.example` });
  assert.equal((await flood.post('/api/public/enquiry', { name: 'P6', email: 'p6@flood.example' })).status, 429);
});

test('meetings, and the Calendly sync bringing in bookings and new people', async () => {
  const made = await owner.post('/api/meetings', { title: 'Kick-off', start: new Date(Date.now() + 86_400_000).toISOString(), attendeeName: 'Kabir Sethi', minutes: 30 });
  assert.equal(made.status, 200);
  assert.equal(Date.parse(made.data.end) - Date.parse(made.data.start), 30 * 60_000);
  assert.equal((await owner.patch(`/api/meetings/${made.data.id}`, { status: 'completed' })).data.status, 'completed');

  assert.equal((await owner.post('/api/meetings/sync', {})).status, 400, 'not connected yet');
  await owner.patch('/api/settings', { calendlyToken: 'calendly-token-0123456789abcdef' });
  const settings = await owner.get('/api/settings');
  assert.equal(settings.data.calendly.connected, true);
  assert.equal(settings.data.calendly.hint, '••••cdef', 'the token is only ever shown as its last four characters');
  const raw = await env.db.one(`SELECT value->>'calendlyToken' AS token FROM meta WHERE key = 'settings'`);
  assert.match(raw.token, /^v1\./, 'and it’s stored sealed, not in plain text');

  const synced = await owner.post('/api/meetings/sync', {});
  assert.equal(synced.status, 200);
  assert.deepEqual([synced.data.added, synced.data.updated, synced.data.enquiries], [1, 0, 1]);
  const again = await owner.post('/api/meetings/sync', {});
  assert.deepEqual([again.data.added, again.data.updated, again.data.enquiries], [0, 1, 0]);
  const meetings = await owner.get('/api/meetings');
  const booked = meetings.data.items.find((item) => item.source === 'calendly');
  assert.equal(booked.attendeeEmail, 'riya@kapoor.example');
  assert.equal(booked.location, 'Google Meet');
  const person = (await owner.get('/api/enquiries?q=riya')).data.items[0];
  assert.equal(person.source, 'calendly');
  assert.equal(person.status, 'meeting');
  const detail = await owner.get(`/api/enquiries/${person.id}`);
  assert.equal(detail.data.meetings.length, 1);
});

test('visits are counted without cookies: views, visitors, pages, events; bots are ignored', async () => {
  const visitor = new Client(env.backend, { origin: 'https://studio.test', headers: { origin: 'https://theatlasstudios.vercel.app', 'x-vercel-ip-country': 'IN' }, ip: '198.51.100.30' });
  const hit = (body, headers = {}) => visitor.request('POST', '/api/public/collect', { raw: JSON.stringify(body), headers: { 'content-type': 'text/plain', ...headers } });
  assert.equal((await hit({ p: '/', r: 'https://www.instagram.com/', w: 390 })).status, 204);
  await hit({ p: '/work/yooj', r: 'https://theatlasstudios.vercel.app/', w: 390 });
  await hit({ e: 'Booked a meeting' });
  await hit({ p: '/' }, { 'user-agent': 'Googlebot/2.1' });
  const report = await owner.get('/api/analytics?days=7');
  assert.equal(report.status, 200);
  assert.equal(report.data.totals.views, 2);
  assert.equal(report.data.totals.visitors, 1);
  assert.deepEqual(report.data.projects.map((page) => page.slug), ['yooj']);
  assert.ok(report.data.referrers.some((ref) => ref.name === 'Instagram'));
  assert.ok(!report.data.referrers.some((ref) => /theatlasstudios/.test(ref.name)), 'the site’s own pages aren’t a referrer');
  assert.deepEqual(report.data.countries, [{ name: 'IN', count: 2 }]);
  assert.deepEqual(report.data.events, [{ name: 'Booked a meeting', count: 1 }]);
  const beacon = await env.client().get('/beacon.js');
  assert.equal(beacon.status, 200);
  assert.match(beacon.data, /api\/public\/collect/);
  assert.equal(beacon.headers.get('cross-origin-resource-policy'), 'cross-origin');
});

test('sample data loads and clears; the dashboard and badges add up', async () => {
  const loaded = await owner.post('/api/settings/sample', {});
  assert.equal(loaded.status, 200);
  assert.equal(loaded.data.enquiries, 22);
  const dashboard = await owner.get('/api/dashboard');
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.data.kpis.pipeline > 0);
  assert.equal(dashboard.data.sample, true);
  assert.equal((await owner.get('/api/badges')).data.sample, true);
  const report = await owner.get('/api/analytics?days=30');
  assert.ok(report.data.totals.views > 100, 'sample visits are there');
  assert.equal(report.data.sample, true);
  const cleared = await owner.delete('/api/settings/sample');
  assert.ok(cleared.data.removed >= 31);
  assert.equal((await owner.get('/api/enquiries')).data.items.every((item) => !item.sample), true);
  assert.equal((await owner.get('/api/analytics?days=7')).data.totals.views, 2, 'real visits outlive the sample');
});

test('an export can be imported into another admin', async () => {
  const exported = await owner.get('/api/settings/export');
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-disposition'), /attachment; filename="atlas-admin-/);
  const data = exported.data;
  assert.equal(data.settings.calendlyToken, '', 'tokens are left out');
  assert.ok(data.users.every((user) => !('passwordHash' in user)));

  const other = await boot();
  try {
    const client = other.client();
    await client.setup();
    const imported = await client.request('POST', '/api/settings/import', { raw: JSON.stringify(data), headers: { 'content-type': 'application/json' } });
    assert.equal(imported.status, 200);
    assert.equal(imported.data.enquiries, data.enquiries.length);
    assert.equal(imported.data.meetings, data.meetings.length);
    const twice = await client.request('POST', '/api/settings/import', { raw: JSON.stringify(data), headers: { 'content-type': 'application/json' } });
    assert.equal(twice.data.enquiries, 0, 'nothing is added twice');
  } finally {
    await other.close();
  }
});

test('email can be tested from settings; the schedule needs its secret', async () => {
  const sent = await owner.post('/api/settings/test-email', {});
  assert.equal(sent.status, 200);
  assert.equal(sent.data.to, 'studio@atlas.test');
  const anonymous = env.client();
  assert.equal((await anonymous.get('/api/cron/daily')).status, 401);
  const ran = await anonymous.get('/api/cron/daily', { headers: { authorization: 'Bearer cron-secret-for-tests' } });
  assert.equal(ran.status, 200);
  assert.equal(ran.data.housekeeping, true);
  assert.equal(ran.data.calendly.total, 1);
  const health = await env.client().get('/healthz');
  assert.equal(health.status, 200);
});
