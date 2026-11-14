import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';
import { HttpError } from './shared.mjs';

/**
 * Email: new-enquiry alerts, password resets and invitations. Three ways to
 * send, chosen by what's set:
 *
 *  - SMTP (SMTP_URL, e.g. smtps://you%40gmail.com:app-password@smtp.gmail.com:465):
 *    any mail provider, Gmail with an app password included. Spoken here
 *    directly over TLS (implicit on 465, STARTTLS on 587), so no packages.
 *  - Resend (RESEND_API_KEY), over its HTTPS API.
 *  - The console (MAIL_LOG=true), for local work.
 *
 * Without any of them the admin simply doesn't offer what needs email.
 */

const clean = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const address = (value) => /<([^>]+)>/.exec(value)?.[1] ?? clean(value);

function encodeHeader(value) {
  const text = clean(value);
  return /^[\x00-\x7f]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

const wrap76 = (base64) => base64.replace(/.{1,76}/g, '$&\r\n');

/** A message as SMTP carries it: headers, then a plain-text and an HTML part. */
export function buildMessage({ from, to, subject, text, html, replyTo }) {
  const boundary = `atlas-${crypto.randomBytes(12).toString('hex')}`;
  const domain = address(from).split('@')[1] || 'atlas.local';
  const headers = [
    `From: ${encodeHeader(from)}`,
    `To: ${[to].flat().map(clean).join(', ')}`,
    replyTo && `Reply-To: ${clean(replyTo)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  const part = (type, body) => [`--${boundary}`, `Content-Type: ${type}; charset=utf-8`, 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(body, 'utf8').toString('base64'))].join('\r\n');
  return [...headers, '', part('text/plain', text), part('text/html', html ?? `<pre>${escapeHtml(text)}</pre>`), `--${boundary}--`, ''].join('\r\n');
}

/** Talks SMTP to one server: EHLO, STARTTLS when offered, AUTH, then the message. */
export function sendSmtp({ host, port, secure, user, pass }, { from, to, message, timeout = 20_000 }) {
  return new Promise((resolve, reject) => {
    let socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    let buffer = '';
    let waiting = null;
    let finished = false;
    const done = (error, value) => {
      if (finished) return;
      finished = true;
      // A finished conversation closes politely (QUIT has been sent); a failed one is cut.
      if (error) socket.destroy();
      else {
        socket.end();
        setTimeout(() => socket.destroy(), 2000).unref();
      }
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        const lines = buffer.split('\r\n');
        const end = lines.findIndex((line) => /^\d{3}(?: |$)/.test(line));
        if (end < 0) return;
        const reply = lines.slice(0, end + 1);
        buffer = lines.slice(end + 1).join('\r\n');
        const code = Number(reply[end].slice(0, 3));
        const next = waiting;
        waiting = null;
        next?.({ code, lines: reply });
      }
    };
    const attach = (s) => {
      s.setTimeout(timeout, () => done(new HttpError(504, 'mail_timeout', `The mail server ${host} stopped answering.`)));
      s.on('data', onData);
      s.on('error', (error) => done(new HttpError(502, 'mail_connect', `Couldn’t reach the mail server ${host}:${port} (${error.code ?? error.message}).`)));
    };
    attach(socket);

    const reply = () => new Promise((res) => (waiting = res));
    const command = async (line, expect, what) => {
      if (line !== null) socket.write(`${line}\r\n`);
      const answer = await reply();
      if (!expect.includes(answer.code)) {
        const said = answer.lines.join(' ').slice(0, 300);
        throw new HttpError(answer.code === 535 ? 400 : 502, answer.code === 535 ? 'mail_auth' : 'mail_refused', answer.code === 535 ? `The mail server turned the username and password down (${said}). For Gmail, use an app password.` : `The mail server refused ${what}: ${said}`);
      }
      return answer;
    };

    (async () => {
      const me = os.hostname().replace(/[^a-z0-9.-]/gi, '') || 'atlas-admin';
      await command(null, [220], 'the connection');
      let hello = await command(`EHLO ${me}`, [250], 'EHLO');
      if (!secure && hello.lines.some((line) => /STARTTLS/i.test(line))) {
        await command('STARTTLS', [220], 'STARTTLS');
        socket.removeAllListeners('data');
        socket = tls.connect({ socket, servername: host });
        attach(socket);
        await new Promise((res, rej) => {
          socket.once('secureConnect', res);
          socket.once('error', rej);
        });
        hello = await command(`EHLO ${me}`, [250], 'EHLO');
      }
      if (user) {
        const methods = hello.lines.find((line) => /AUTH/i.test(line)) ?? '';
        if (/PLAIN/i.test(methods) || !/LOGIN/i.test(methods)) {
          await command(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64')}`, [235], 'the sign-in');
        } else {
          await command('AUTH LOGIN', [334], 'the sign-in');
          await command(Buffer.from(user, 'utf8').toString('base64'), [334], 'the sign-in');
          await command(Buffer.from(pass, 'utf8').toString('base64'), [235], 'the sign-in');
        }
      }
      await command(`MAIL FROM:<${address(from)}>`, [250], 'the sender');
      for (const recipient of [to].flat()) await command(`RCPT TO:<${address(recipient)}>`, [250, 251], `the recipient ${address(recipient)}`);
      await command('DATA', [354], 'the message');
      const body = message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
      const accepted = await command(`${body}${body.endsWith('\r\n') ? '' : '\r\n'}.`, [250], 'the message');
      socket.write('QUIT\r\n');
      done(null, { id: accepted.lines.join(' ').slice(4, 200) });
    })().catch((error) => done(error instanceof HttpError ? error : new HttpError(502, 'mail', `Sending mail failed (${error.message}).`)));
  });
}

export function createMailer(config, { capture = null } = {}) {
  const { smtp, resendKey, from, log } = config.mail;
  const kind = capture ? 'capture' : smtp && !smtp.invalid ? 'smtp' : resendKey ? 'resend' : log ? 'log' : null;
  const sender = from || 'Atlas Studios Admin <admin@localhost>';

  return {
    kind,
    configured: Boolean(kind),
    /** `to` is an address or a list; `text` is required, `html` optional. */
    async send({ to, subject, text, html, replyTo }) {
      if (!kind) throw new HttpError(503, 'mail_off', 'Email isn’t set up for the admin yet (SMTP_URL or RESEND_API_KEY).');
      const recipients = [to].flat().filter(Boolean);
      if (!recipients.length) throw new HttpError(400, 'invalid', 'There’s no one to send that to.');
      if (kind === 'capture') {
        capture.push({ from: sender, to: recipients, subject, text, html, replyTo });
        return { id: `captured-${capture.length}` };
      }
      if (kind === 'log') {
        console.log(`\n[mail] to ${recipients.join(', ')}: ${subject}\n${text}\n`);
        return { id: 'logged' };
      }
      if (kind === 'resend') {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: sender, to: recipients, subject, text, html, reply_to: replyTo || undefined }),
          signal: AbortSignal.timeout(15_000),
        }).catch(() => null);
        if (!response) throw new HttpError(502, 'mail_connect', 'Resend couldn’t be reached.');
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 400 : 502, 'mail_refused', `Resend refused the message: ${body.message ?? response.status}`);
        return { id: body.id };
      }
      return sendSmtp(smtp, { from: sender, to: recipients, message: buildMessage({ from: sender, to: recipients, subject, text, html, replyTo }) });
    },
  };
}

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/**
 * The admin's emails share one layout: a short title, a sentence or two, an
 * optional table of details and one button. Returns { text, html }.
 */
export function renderEmail({ title, intro, rows = [], button = null, outro = '' }) {
  const lines = [title, '', intro, ''];
  for (const [label, value] of rows) if (value) lines.push(`${label}: ${value}`);
  if (rows.length) lines.push('');
  if (button) lines.push(`${button.label}: ${button.url}`, '');
  if (outro) lines.push(outro, '');
  lines.push('— Atlas Studios Admin');

  const table = rows.filter(([, value]) => value).length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:18px 0">${rows
        .filter(([, value]) => value)
        .map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#5c6d8f;font-size:13px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:8px 0;color:#020923;font-size:14px;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`)
        .join('')}</table>`
    : '';
  const action = button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#095cfb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600;font-size:14px">${escapeHtml(button.label)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7ff;padding:24px;font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d9e2f2;border-radius:14px;padding:28px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#095cfb;font-weight:700">Atlas Studios · Admin</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#020923">${escapeHtml(title)}</h1>
<p style="margin:0;color:#3a4d73;font-size:14px;line-height:1.6">${escapeHtml(intro)}</p>
${table}${action}${outro ? `<p style="margin:0;color:#5c6d8f;font-size:13px;line-height:1.6">${escapeHtml(outro)}</p>` : ''}
</div></body></html>`;
  return { text: lines.join('\n'), html };
}
