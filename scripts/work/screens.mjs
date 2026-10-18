#!/usr/bin/env node
/**
 * Captures each system's screens from its live product, for the system viewer.
 *
 * For every system in SYSTEMS this writes
 *   public/work/systems/<slug>/NN.webp        each screen at reading resolution (2x)
 *   public/work/systems/<slug>/NN-half.webp   the same at half the width
 *   src/content/screens/<slug>.json           every screen's files, size, average tone,
 *                                             a 24px preview, its device and caption
 * The first desktop screen is the system's card and its title card's backdrop.
 *
 * It drives a headless Google Chrome over the DevTools protocol (Node 18+, no
 * packages; set CHROME_PATH if Chrome isn't in the usual place). Pages are
 * scrolled with real wheel events, so scroll-driven films reach the frame
 * asked for. Pictures are resized and encoded in the browser itself.
 *
 * Usage
 *   node scripts/work/screens.mjs                  all systems
 *   node scripts/work/screens.mjs shoku keeri      just these
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGES_OUT = join(ROOT, 'public', 'work', 'systems');
const DATA_OUT = join(ROOT, 'src', 'content', 'screens');

/** Desktop screens are read at 2400px (2x a 1200px column); phones at 2x. */
const DESKTOP = { width: 1440, height: 900, dpr: 2, out: 2400 };
const PHONE = { width: 390, height: 844, dpr: 3, out: 780 };
const QUALITY = 0.86;
const PREVIEW_WIDTH = 24;

/**
 * What to capture, in order. `y` scrolls the page there first (desktop pages
 * with wheel events); `click` presses the button or link with that text;
 * `image` takes a screenshot the product already publishes, `crop` trims it.
 */
const SYSTEMS = {
  'maple-furnishers': [
    { url: 'https://maplefurnishers.com/', y: 0, wait: 6500, caption: 'The intro film: every home has a story' },
    { url: 'https://maplefurnishers.com/', y: 3280, caption: 'The chair weaves itself together: let’s furnish yours' },
    { url: 'https://maplefurnishers.com/', y: 6560, caption: 'Craftsmanship: the chair taken apart, every curve named' },
    { url: 'https://maplefurnishers.com/', y: 12300, caption: 'Rooms to shop: hotspots settle on the furniture' },
    { url: 'https://maplefurnishers.com/', y: 20500, caption: 'The terrace: luxury doesn’t end at the door' },
    { url: 'https://maplefurnishers.com/', y: 22140, caption: 'The brand card at the end of the film' },
    { url: 'https://maplefurnishers.com/spaces', wheel: 2, caption: 'Spaces: Nimbus, a world shaped by clouds' },
    { url: 'https://maplefurnishers.com/catalogue', caption: 'The catalogue: nine families of collections' },
    { url: 'https://maplefurnishers.com/customize', caption: 'Make it yours: the Axtra chair in four woods and four fabrics' },
    { url: 'https://maplefurnishers.com/about', caption: 'About: a home, drawn around you' },
    { url: 'https://maplefurnishers.com/', device: 'phone', wait: 6500, caption: 'The phone story: portrait films and a dock' },
    { url: 'https://maplefurnishers.com/catalogue', device: 'phone', caption: 'The catalogue on a phone' },
    { url: 'https://maplefurnishers.com/customize', device: 'phone', caption: 'The customizer on a phone' },
  ],
  'maple-studios': [
    { url: 'https://maplestudios.co.in/', y: 0, wait: 6500, caption: 'Intelligence, built into business' },
    { url: 'https://maplestudios.co.in/', y: 3100, caption: 'The studio statement, lit word by word' },
    { url: 'https://maplestudios.co.in/', y: 5400, caption: 'Automate, integrate, accelerate' },
    { url: 'https://maplestudios.co.in/', y: 7800, caption: 'Selected work and explorations' },
    { url: 'https://maplestudios.co.in/work', caption: 'Our work: thumbnails drifting around the mark' },
    { url: 'https://maplestudios.co.in/work/get-shoku', y: 800, caption: 'A case study, read as a deck' },
    { url: 'https://maplestudios.co.in/services', caption: 'Area of expertise: the WebGL relic orbit' },
    { url: 'https://maplestudios.co.in/about', caption: 'About: the live eagle' },
    { url: 'https://maplestudios.co.in/contact', caption: 'Contact: let’s start something' },
    { url: 'https://maplestudios.co.in/', device: 'phone', wait: 6500, caption: 'The hero on a phone' },
    { url: 'https://maplestudios.co.in/work', device: 'phone', caption: 'The work, on a phone' },
    { url: 'https://maplestudios.co.in/contact', device: 'phone', caption: 'Contact, on a phone' },
  ],
  shoku: [
    { url: 'https://getshoku.com/', caption: 'Your café. Your brand. Zero commission.' },
    { url: 'https://getshoku.com/', y: 1560, caption: 'A storefront your regulars actually want to open' },
    { url: 'https://getshoku.com/', y: 3900, caption: 'From sign-up to a live branded app, in days' },
    { url: 'https://getshoku.com/', y: 5460, caption: 'Flat pricing, zero per-order commission' },
    { url: 'https://getshoku.com/', y: 7020, caption: 'Own your table: book a live demo' },
    { url: 'https://cardamom.shoku.app/', caption: 'A café’s own storefront, centred for the desktop' },
    { url: 'https://cardamom.shoku.app/admin/login', caption: 'The café console’s sign-in' },
    { url: 'https://admin.shoku.app/console/login', caption: 'The platform console, where Maple runs every café' },
    { url: 'https://cardamom.shoku.app/', device: 'phone', caption: 'Cardamom & Co., on its own subdomain' },
    { url: 'https://cardamom.shoku.app/menu', device: 'phone', caption: 'The menu, with diet chips and Shoku AI' },
    { url: 'https://cardamom.shoku.app/ai', device: 'phone', caption: 'Shoku AI, ready with suggestions' },
  ],
  keeri: [
    { image: 'https://maplefurnishers.keeri.in/docs/screenshots/keeri-product-detail-1440.png', crop: { height: 900 }, caption: 'A design: photo, information and its tabs' },
    { image: 'https://maplefurnishers.keeri.in/docs/screenshots/keeri-products-workspace-1440.png', crop: { height: 900 }, caption: 'The products workspace: 52 designs, sign-offs, Shopify state' },
    { image: 'https://maplefurnishers.keeri.in/docs/screenshots/keeri-photoshoot-gallery-1440.png', crop: { height: 900 }, caption: 'The AI photoshoot gallery, frame by frame' },
    { image: 'https://maplefurnishers.keeri.in/docs/screenshots/keeri-publish-ready-1440.png', crop: { height: 900 }, caption: 'Publish to Shopify: only what was reviewed' },
    { image: 'https://maplefurnishers.keeri.in/docs/screenshots/keeri-commercial-workspace-1440.png', crop: { height: 900 }, caption: 'Bulk commercial edit: HSN, warranty, GST and MRP' },
    { image: 'https://maplefurnishers.keeri.in/docs/screenshots/product-health-workspace.png', crop: { height: 900 }, caption: 'Product health: media and data coverage' },
    { url: 'https://maplefurnishers.keeri.in/login', caption: 'Every enquiry, quotation and dispatch in one place' },
    { image: 'https://maplefurnishers.keeri.in/docs/screenshots/keeri-product-editor-390.png', device: 'phone', caption: 'Editing a product on a phone' },
    { image: 'https://maplefurnishers.keeri.in/docs/screenshots/keeri-products-filters-390.png', device: 'phone', caption: 'Filters, in a sheet' },
    { url: 'https://maplefurnishers.keeri.in/login', device: 'phone', caption: 'The branded sign-in on a phone' },
  ],
  'ishita-traders': [
    { url: 'https://ishita-traders.vercel.app/products', caption: 'The catalogue: UTL, Exide and Microtek' },
    { url: 'https://ishita-traders.vercel.app/products', y: 800, caption: 'Every product with its key specs and a dealer-price button' },
    { url: 'https://ishita-traders.vercel.app/products/exide-invatubular-it500-150ah', caption: 'A product page, with its RFQ' },
    { url: 'https://ishita-traders.vercel.app/brands', caption: 'Brands: trusted names under one roof' },
    { url: 'https://ishita-traders.vercel.app/brands', y: 800, caption: 'One block per brand, with what it’s best at' },
    { url: 'https://ishita-traders.vercel.app/clients', y: 800, caption: 'Different needs, one reliable partner' },
    { url: 'https://ishita-traders.vercel.app/contact', caption: 'Contact: open now, and one tap to WhatsApp' },
    { url: 'https://ishita-traders.vercel.app/admin/login', caption: 'The admin console’s sign-in' },
    { url: 'https://ishita-traders.vercel.app/products', device: 'phone', caption: 'The catalogue on a phone' },
    { url: 'https://ishita-traders.vercel.app/products/exide-invatubular-it500-150ah', device: 'phone', caption: 'A product on a phone' },
    { url: 'https://ishita-traders.vercel.app/contact', device: 'phone', caption: 'Contact, with the call and WhatsApp dock' },
  ],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('Google Chrome was not found: set CHROME_PATH.');
  return found;
}

/** A headless Chrome of its own (its own profile), and a tiny DevTools client. */
async function launch(work) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(work, 'profile')}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let info;
  for (let i = 0; i < 80 && !info; i++) {
    info = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
    if (!info) await sleep(250);
  }
  if (!info) throw new Error('Chrome did not start.');
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId && { sessionId }) }));
    });

  const open = async (device) => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call('Page.enable');
    await call('Runtime.enable');
    if (device) {
      const mobile = device === PHONE;
      await call('Emulation.setDeviceMetricsOverride', { width: device.width, height: device.height, deviceScaleFactor: device.dpr, mobile });
      if (mobile) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    const evaluate = async (expression) => {
      const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
      return res.result.value;
    };
    return {
      call,
      evaluate,
      close: () => send('Target.closeTarget', { targetId }).catch(() => {}),
      async go(url) {
        await call('Page.navigate', { url });
        for (let i = 0; i < 90; i++) {
          if ((await evaluate('document.readyState').catch(() => '')) === 'complete') break;
          await sleep(500);
        }
      },
    };
  };

  return {
    open,
    async close() {
      await send('Browser.close').catch(() => {});
      ws.close();
      await sleep(500);
      proc.kill();
    },
  };
}

/** Scrolls a desktop page down to `target` with wheel events, as a person would. */
async function scrollTo(page, target) {
  for (let i = 0; i < 120; i++) {
    const y = await page.evaluate('Math.round(window.scrollY)');
    if (y >= target - 6) return;
    const step = Math.min(800, target - y + 20);
    for (let k = 0; k < 8; k++) {
      await page.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: step / 8 });
      await sleep(35);
    }
    await sleep(450);
    if ((await page.evaluate('Math.round(window.scrollY)')) === y) return;
  }
}

async function wheelSteps(page, count) {
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) {
      await page.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 125 });
      await sleep(60);
    }
    await sleep(1800);
  }
}

async function clickText(page, text) {
  const at = await page.evaluate(
    `(() => { const el = [...document.querySelectorAll('button, a, [role=tab]')].find((node) => (node.innerText || '').trim().toLowerCase().startsWith(${JSON.stringify(text.toLowerCase())})); if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
  );
  if (!at) throw new Error(`Nothing to click reads "${text}".`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.call('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 });
  }
}

/** Resizes and encodes one picture inside the browser: its two renderings, a 24px preview and its tone. */
const PROCESS = (url, outWidth, crop, quality, previewWidth) => `(async () => {
  const image = new Image();
  image.src = ${JSON.stringify(url)};
  await image.decode();
  const sw = image.naturalWidth;
  const sh = Math.min(image.naturalHeight, ${crop ? `Math.round(${crop.height} * image.naturalWidth / ${crop.width ?? 1440})` : 'image.naturalHeight'});
  const draw = (w) => {
    const h = Math.round(sh * w / sw);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, sw, sh, 0, 0, w, h);
    return canvas;
  };
  const encode = (canvas, q) => new Promise((resolve) => canvas.toBlob((blob) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  }, 'image/webp', q));
  const width = Math.min(${outWidth}, sw);
  const full = draw(width);
  const half = draw(Math.round(width / 2));
  // Step down to the preview so it keeps the picture's colour, not its noise.
  const mid = draw(${previewWidth} * 8);
  const tiny = document.createElement('canvas');
  tiny.width = ${previewWidth}; tiny.height = Math.max(1, Math.round(mid.height * ${previewWidth} / mid.width));
  const tctx = tiny.getContext('2d'); tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(mid, 0, 0, tiny.width, tiny.height);
  const dot = document.createElement('canvas'); dot.width = 1; dot.height = 1;
  const dctx = dot.getContext('2d'); dctx.imageSmoothingQuality = 'high'; dctx.drawImage(tiny, 0, 0, 1, 1);
  const [r, g, b] = dctx.getImageData(0, 0, 1, 1).data;
  const hex = (n) => n.toString(16).padStart(2, '0');
  return {
    width: full.width, height: full.height,
    full: await encode(full, ${quality}), half: await encode(half, ${quality}),
    preview: tiny.toDataURL('image/webp', 0.6), tone: '#' + hex(r) + hex(g) + hex(b),
  };
})()`;

async function main(only) {
  const work = mkdtempSync(join(tmpdir(), 'atlas-screens-'));
  const captures = join(work, 'captures');
  mkdirSync(captures, { recursive: true });
  // The browser processes pictures served from here, so its canvases stay untainted.
  const server = createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://x').pathname.slice(1));
    if (!name) return response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>screens</title>');
    const file = join(captures, name);
    if (!file.startsWith(captures) || !name.endsWith('.png') || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'content-type': 'image/png' }).end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch(work);
  const lab = await browser.open(null);
  await lab.go(`${origin}/`);

  try {
    for (const [slug, shots] of Object.entries(SYSTEMS)) {
      if (only.size && !only.has(slug)) continue;
      const folder = join(PAGES_OUT, slug);
      mkdirSync(folder, { recursive: true });
      for (const stale of readdirSync(folder)) if (stale.endsWith('.webp')) rmSync(join(folder, stale));
      const screens = [];
      let page = null;
      let at = '';
      for (const [index, shot] of shots.entries()) {
        const device = shot.device === 'phone' ? PHONE : DESKTOP;
        const name = String(index + 1).padStart(2, '0');
        const raw = join(captures, `${slug}-${name}.png`);
        if (shot.image) {
          const response = await fetch(shot.image);
          if (!response.ok) throw new Error(`${shot.image}: HTTP ${response.status}`);
          writeFileSync(raw, Buffer.from(await response.arrayBuffer()));
        } else {
          // Shots of the same page share one visit, scrolling further down it each time.
          const key = `${shot.device ?? 'desktop'} ${shot.url}`;
          const fresh = !page || at !== key || (shot.y ?? 0) < (page.y ?? 0) || shot.click || shot.wheel;
          if (fresh) {
            await page?.close();
            page = await browser.open(device);
            page.y = 0;
            await page.go(shot.url);
            await sleep(shot.wait ?? 4500);
            at = key;
          }
          if (shot.wheel) await wheelSteps(page, shot.wheel);
          if (shot.y && device === DESKTOP) {
            await scrollTo(page, shot.y);
            page.y = shot.y;
            await sleep(1600);
          } else if (shot.y) {
            await page.evaluate(`window.scrollTo(0, ${shot.y})`);
            await sleep(1600);
          }
          if (shot.click) {
            await clickText(page, shot.click);
            await sleep(2600);
          }
          const { data } = await page.call('Page.captureScreenshot', { format: 'png' });
          writeFileSync(raw, Buffer.from(data, 'base64'));
        }
        const out = await lab.evaluate(PROCESS(`${origin}/${slug}-${name}.png`, device.out, shot.crop, QUALITY, PREVIEW_WIDTH));
        writeFileSync(join(folder, `${name}.webp`), Buffer.from(out.full, 'base64'));
        writeFileSync(join(folder, `${name}-half.webp`), Buffer.from(out.half, 'base64'));
        screens.push({
          src: `/work/systems/${slug}/${name}.webp`,
          half: `/work/systems/${slug}/${name}-half.webp`,
          width: out.width,
          height: out.height,
          tone: out.tone,
          preview: out.preview,
          device: shot.device === 'phone' ? 'phone' : 'desktop',
          caption: shot.caption,
        });
        console.log(`${slug} ${name}: ${shot.caption}`);
      }
      await page?.close();
      mkdirSync(DATA_OUT, { recursive: true });
      writeFileSync(join(DATA_OUT, `${slug}.json`), `${JSON.stringify({ screens }, null, 2)}\n`);
    }
  } finally {
    await browser.close();
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
}

const only = new Set(process.argv.slice(2));
const unknown = [...only].filter((slug) => !(slug in SYSTEMS));
if (unknown.length) {
  console.error(`Unknown systems: ${unknown.join(', ')}. Known: ${Object.keys(SYSTEMS).join(', ')}`);
  process.exit(1);
}
await main(only);
