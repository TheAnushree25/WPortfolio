import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Prints the documents' HTML to PDF with a real browser (Microsoft Edge or
 * Google Chrome, found on this computer, or the path in PDF_BROWSER), driven
 * over the DevTools protocol with Node's own WebSocket, so nothing extra is
 * installed. Each document is printed at full size first; if it runs past
 * its page count, the type is stepped down a little and it's printed again,
 * down to 85%. One browser at a time, and every process it starts is
 * stopped afterwards.
 */

const CANDIDATES = {
  win32: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium'],
};

/** A browser that can print, or null. */
export function findBrowser() {
  const forced = (process.env.PDF_BROWSER ?? '').trim();
  if (forced) return fs.existsSync(forced) ? forced : null;
  return (CANDIDATES[process.platform] ?? CANDIDATES.linux).find((file) => file && fs.existsSync(file)) ?? null;
}

const SCALES = [1, 0.96, 0.92, 0.88, 0.85];

/** How many pages a PDF has. */
export function pageCount(pdf) {
  const text = pdf.toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

let queue = Promise.resolve();

/**
 * Prints each job ({ html(scale) → string, pages }) and resolves to
 * [{ pdf, pages, scale, overflow }]. `launch` can supply another browser
 * (a hosted runtime's Chromium): { executablePath, args }.
 */
export function renderPdfs(jobs, { launch = null, timeout = 60_000 } = {}) {
  const run = queue.then(() => render(jobs, launch, timeout));
  queue = run.catch(() => {});
  return run;
}

async function render(jobs, launch, timeout) {
  const executable = launch?.executablePath ?? findBrowser();
  if (!executable) throw new Error('No browser to print with: install Microsoft Edge or Google Chrome, or set PDF_BROWSER to one.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-pdf-'));
  const args = [...(launch?.args ?? ['--headless=new', '--disable-gpu']), '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'];
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  const deadline = setTimeout(() => stop(child), timeout);
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let buffer = '';
      const fail = (message) => reject(new Error(message));
      child.once('error', (error) => fail(`The browser didn’t start: ${error.message}`));
      child.once('exit', (code) => fail(`The browser closed (exit code ${code}) before it was ready.`));
      child.stderr.on('data', (chunk) => {
        buffer += chunk.toString();
        const found = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
        if (found) resolve(found[1]);
      });
      setTimeout(() => fail('The browser took too long to start.'), 20_000).unref();
    });
    const cdp = await connect(endpoint);
    try {
      const out = [];
      for (const job of jobs) out.push(await printJob(cdp, job));
      return out;
    } finally {
      cdp.close();
    }
  } finally {
    clearTimeout(deadline);
    await stop(child);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }
}

async function printJob(cdp, job) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => cdp.send(method, params, sessionId);
  try {
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ftp://*', 'ws://*', 'wss://*'] });
    const { frameTree } = await send('Page.getFrameTree');
    let last = null;
    for (const scale of SCALES) {
      await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: job.html(scale) });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const { data } = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, generateTaggedPDF: true, transferMode: 'ReturnAsBase64' });
      const pdf = Buffer.from(data, 'base64');
      const pages = pageCount(pdf);
      last = { pdf, pages, scale, overflow: pages > job.pages };
      if (pages <= job.pages) return last;
    }
    return last;
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

function connect(endpoint) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString());
      if (!message.id || !pending.has(message.id)) return;
      const { resolve: done, reject: fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ''}`));
      else done(message.result);
    });
    socket.addEventListener('error', () => reject(new Error('Couldn’t talk to the browser.')));
    socket.addEventListener('close', () => {
      for (const { reject: fail } of pending.values()) fail(new Error('The browser closed.'));
      pending.clear();
    });
    socket.addEventListener('open', () =>
      resolve({
        send(method, params = {}, sessionId) {
          return new Promise((done, fail) => {
            const messageId = ++id;
            pending.set(messageId, { resolve: done, reject: fail });
            socket.send(JSON.stringify({ id: messageId, method, params, ...(sessionId && { sessionId }) }));
          });
        },
        close() {
          try {
            socket.close();
          } catch {
            /* already closed */
          }
        },
      }),
    );
  });
}

/** Stops the browser and every helper process it started. */
function stop(child) {
  return new Promise((resolve) => {
    if (!child.pid || child.exitCode !== null) return resolve();
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
      resolve();
    }
  });
}
