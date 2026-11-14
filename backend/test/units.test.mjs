import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';
import { base32Decode, base32Encode, codeAt, hashRecovery, newRecoveryCodes, otpauthUri, verifyCode } from '../src/totp.mjs';
import { qrMatrix } from '../src/qr.mjs';
import { createSealer } from '../src/secrets.mjs';
import { buildMessage, renderEmail, sendSmtp } from '../src/mail.mjs';
import { configProblems, loadConfig, maskUrl } from '../src/config.mjs';

const jsQR = createRequire(import.meta.url)('jsqr');

test('codes match RFC 6238’s published test values', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [seconds, expected] of vectors) assert.equal(codeAt(secret, Math.floor(seconds / 30), 8), expected, `at ${seconds}s`);
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
});

test('a code is accepted for its 30 seconds and the next and previous, never twice', () => {
  const secret = base32Encode(Buffer.from('a-test-secret-of-20b'));
  const time = 1_800_000_000_000;
  const step = Math.floor(time / 30_000);
  assert.equal(verifyCode(secret, codeAt(secret, step), { time }), step);
  assert.equal(verifyCode(secret, codeAt(secret, step - 1), { time }), step - 1);
  assert.equal(verifyCode(secret, codeAt(secret, step + 2), { time }), 0);
  assert.equal(verifyCode(secret, codeAt(secret, step), { time, lastStep: step }), 0, 'not again');
  assert.equal(verifyCode(secret, 'abcdef', { time }), 0);
  const codes = newRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.equal(hashRecovery(codes[0].toUpperCase()), hashRecovery(codes[0]));
  assert.match(otpauthUri({ secret: 'ABC', account: 'a b@c.d' }), /^otpauth:\/\/totp\/Atlas%20Studios:a%20b%40c\.d\?secret=ABC&issuer=Atlas%20Studios$/);
});

test('QR codes decode back to what was encoded, from short to the largest version', () => {
  const decode = (grid) => {
    const scale = 4;
    const quiet = 4;
    const width = (grid.length + quiet * 2) * scale;
    const data = new Uint8ClampedArray(width * width * 4).fill(255);
    grid.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (!dark) return;
        for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) data.fill(0, (((r + quiet) * scale + y) * width + (c + quiet) * scale + x) * 4, (((r + quiet) * scale + y) * width + (c + quiet) * scale + x) * 4 + 3);
      }),
    );
    return jsQR(data, width, width)?.data;
  };
  const samples = ['1', otpauthUri({ secret: base32Encode(Buffer.alloc(20, 7)), account: 'contact.theatlasstudio@gmail.com' }), 'é'.repeat(80), 'x'.repeat(400)];
  for (const sample of samples) assert.equal(decode(qrMatrix(sample)), sample);
  assert.throws(() => qrMatrix('x'.repeat(500)));
});

test('sealed secrets open only with the same ADMIN_SECRET, and tampering is caught', () => {
  const sealer = createSealer('one-secret-one-secret-one-secret-1');
  const sealed = sealer.seal('calendly-token');
  assert.match(sealed, /^v1\./);
  assert.notEqual(sealer.seal('calendly-token'), sealed, 'a fresh nonce every time');
  assert.equal(sealer.open(sealed), 'calendly-token');
  assert.throws(() => createSealer('another-secret-another-secret-22').open(sealed));
  const bytes = Buffer.from(sealed.slice(3), 'base64url');
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => sealer.open(`v1.${bytes.toString('base64url')}`));
  assert.equal(sealer.open(''), '');
});

test('mail goes out over SMTP: greeting, sign-in, envelope, dot-stuffed message', async () => {
  const seen = [];
  let message = '';
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    socket.on('error', () => {});
    socket.write('220 fake.smtp ready\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          message = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write('250 2.0.0 queued as 42\r\n');
          continue;
        }
        const newline = buffer.indexOf('\r\n');
        if (newline < 0) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        seen.push(line);
        if (/^EHLO/.test(line)) socket.write('250-fake.smtp\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
        else if (/^AUTH PLAIN/.test(line)) socket.write(Buffer.from(line.slice(11), 'base64').toString() === '\0studio@atlas.test\0app-password' ? '235 OK\r\n' : '535 no\r\n');
        else if (/^(MAIL|RCPT)/.test(line)) socket.write('250 OK\r\n');
        else if (line === 'DATA') {
          inData = true;
          socket.write('354 go ahead\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const smtp = { host: '127.0.0.1', port, secure: false, user: 'studio@atlas.test', pass: 'app-password' };
  const { text, html } = renderEmail({ title: 'Hello', intro: '.A line that starts with a dot', rows: [['Name', 'Meera']] });
  const result = await sendSmtp(smtp, { from: 'Atlas Studios <studio@atlas.test>', to: ['meera@example.com'], message: buildMessage({ from: 'Atlas Studios <studio@atlas.test>', to: 'meera@example.com', subject: 'Héllo from the studio', text, html }) });
  assert.match(result.id, /queued as 42/);
  assert.ok(seen.includes('MAIL FROM:<studio@atlas.test>'));
  assert.ok(seen.includes('RCPT TO:<meera@example.com>'));
  assert.match(message, /^Subject: =\?UTF-8\?B\?/m, 'a non-ASCII subject is encoded');
  assert.match(message, /Content-Type: multipart\/alternative/);
  await assert.rejects(sendSmtp({ ...smtp, pass: 'wrong' }, { from: 'a@b.c', to: ['d@e.f'], message: 'Subject: x\r\n\r\nx' }), /turned the username and password down/);
  await new Promise((resolve) => server.close(resolve));
});

test('settings explain what’s missing, and secrets in addresses are hidden', () => {
  const bare = configProblems(loadConfig({ VERCEL: '1' }));
  const messages = bare.filter((problem) => problem.level === 'error').map((problem) => problem.message).join(' ');
  for (const name of ['GITHUB_TOKEN', 'GITHUB_REPO', 'DATABASE_URL', 'ADMIN_SECRET']) assert.match(messages, new RegExp(name));
  const good = loadConfig({ GITHUB_TOKEN: 't', GITHUB_REPO: 'TheAnushree25/WPortfolio', DATABASE_URL: 'postgres://u:p@h/d', ADMIN_SECRET: 'x'.repeat(40), ADMIN_SETUP_TOKEN: 's', ADMIN_PUBLIC_URL: 'https://a.b/admin', SMTP_URL: 'smtps://me%40gmail.com:app%20pw@smtp.gmail.com:465', MAIL_FROM: 'A <me@gmail.com>', VERCEL: '1' });
  assert.deepEqual(configProblems(good).filter((problem) => problem.level === 'error'), []);
  assert.deepEqual([good.github.owner, good.github.name, good.basePath, good.trustProxy], ['TheAnushree25', 'WPortfolio', '/admin', true]);
  assert.deepEqual(good.mail.smtp, { host: 'smtp.gmail.com', port: 465, secure: true, user: 'me@gmail.com', pass: 'app pw' });
  assert.equal(maskUrl('postgres://user:secret@db.example/atlas'), 'postgres://user:%E2%80%A2%E2%80%A2%E2%80%A2@db.example/atlas');
});

test('a GitHub call that fails at the connection is tried again; GitHub’s own answers are not', async () => {
  const { GitHub } = await import('../src/github/client.mjs');
  let calls = 0;
  const flaky = async () => {
    calls++;
    if (calls === 1) throw new TypeError('fetch failed: other side closed');
    return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  assert.equal((await new GitHub({ token: 't', owner: 'o', name: 'r', fetch: flaky }).repository()).default_branch, 'main');
  assert.equal(calls, 2);
  let refused = 0;
  const denied = async () => {
    refused++;
    return new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401, headers: { 'content-type': 'application/json' } });
  };
  await assert.rejects(new GitHub({ token: 't', owner: 'o', name: 'r', fetch: denied }).repository(), (error) => error.code === 'github_token');
  assert.equal(refused, 1, 'an expired token is reported at once, not retried');
});
