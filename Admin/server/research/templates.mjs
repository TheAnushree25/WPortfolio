/**
 * The two documents as print-ready HTML, in the design of the studio's
 * reference PDFs: the two-page internal summary (the lead, then the pitch)
 * and the one-page online health check. Everything that came from the web or
 * from Gemini is escaped; the page carries a policy that allows no scripts
 * and no network, so a document can't run or fetch anything. `scale`
 * shrinks the type a little when the text runs long (see pdf.mjs).
 */

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cssString = (value) => `"${String(value ?? '').replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ')}"`;

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

const BASE_CSS = `
:root {
  --navy: #17365d;
  --ink: #1f2937;
  --text: #2b3443;
  --muted: #6b7280;
  --faint: #9aa3af;
  --line: #d9dee7;
  --red: #c0352b;
  --red-soft: #fcefed;
  --green: #2e7d4f;
  --green-soft: #edf6f0;
  --amber: #a15c07;
  --blue-soft: #eef3f9;
  --gray-soft: #f2f4f7;
}
* { box-sizing: border-box; }
html { font-size: calc(9.35pt * var(--scale)); }
/* On screen (the Details page's preview) the document sits on a sheet the width of A4. */
@media screen {
  html { background: #e9edf3; }
  body { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 15mm 16mm; background: #fff; }
  .page2 { margin-top: 12mm; padding-top: 9mm; border-top: 2px dashed var(--line); }
}
body { margin: 0; font-family: 'Segoe UI', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif; color: var(--text); line-height: 1.38; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-feature-settings: 'lnum' 1; }
p { margin: 0; }
b, strong { color: var(--ink); font-weight: 600; }
.eyebrow { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--red); }
h1 { margin: 0.15rem 0 0.1rem; font-size: 2.45rem; line-height: 1.12; color: var(--navy); font-weight: 600; letter-spacing: -0.01em; }
.sub { font-size: 1.12rem; color: var(--ink); }
.sub2 { font-size: 0.92rem; color: var(--muted); margin-top: 0.1rem; }
.rule { height: 3px; background: var(--navy); margin: 0.65rem 0 0.9rem; }
.callouts { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
.callout { padding: 0.6rem 0.85rem 0.7rem; border-left: 4px solid; }
.callout .eyebrow { font-size: 0.74rem; margin-bottom: 0.15rem; }
.callout h2 { margin: 0 0 0.2rem; font-size: 1.36rem; line-height: 1.2; font-weight: 600; }
.callout.red { background: var(--red-soft); border-color: var(--red); }
.callout.red h2 { color: #a3271e; }
.callout.green { background: var(--green-soft); border-color: var(--green); }
.callout.green .eyebrow, .callout.green h2 { color: #22603c; }
.callout.blue { background: var(--blue-soft); border-color: var(--navy); }
.callout.blue .eyebrow { color: var(--navy); }
.tiles { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; border: 1px solid var(--line); border-radius: 3px; margin: 0.75rem 0 0.85rem; }
.tile { padding: 0.35rem 0.6rem 0.4rem; border-left: 1px solid var(--line); min-width: 0; }
.tile:first-child { border-left: 0; }
.tile .v { font-size: 1.45rem; font-weight: 650; color: var(--navy); line-height: 1.15; white-space: nowrap; }
.tile .l { font-size: 0.78rem; color: var(--muted); line-height: 1.2; }
.part { display: flex; align-items: center; gap: 0.6rem; margin: 0.2rem 0 0.55rem; }
.part span { background: var(--navy); color: #fff; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; padding: 0.22rem 0.6rem; border-radius: 2px; white-space: nowrap; }
.part::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.cols { columns: 2; column-gap: 1.35rem; }
.sec { break-inside: avoid; margin-bottom: 0.7rem; }
.sec h3 { margin: 0 0 0.35rem; padding-bottom: 0.2rem; border-bottom: 1px solid var(--line); font-size: 1.13rem; color: var(--navy); font-weight: 650; }
.sec h3 .n { color: var(--faint); font-weight: 400; margin-right: 0.3rem; }
.sec h3 small { font-size: 0.78rem; color: var(--muted); font-weight: 400; margin-left: 0.3rem; }
ul.facts { list-style: none; margin: 0; padding: 0; }
ul.facts li { position: relative; padding-left: 0.95rem; margin: 0 0 0.3rem; }
ul.facts li::before { content: ''; position: absolute; left: 0.2rem; top: 0.55em; width: 0.28rem; height: 0.28rem; border-radius: 50%; background: var(--ink); }
ul.facts li.cross::before, ul.facts li.tick::before { content: '✕'; background: none; width: auto; height: auto; top: 0; left: 0; font-size: 1em; color: var(--red); font-weight: 700; }
ul.facts li.tick::before { content: '✓'; color: var(--green); }
.probable { color: var(--amber); font-weight: 600; }
.limits { break-inside: avoid; background: var(--gray-soft); padding: 0.55rem 0.7rem; font-size: 0.86rem; color: var(--muted); border-radius: 2px; }
.limits b { color: var(--muted); }
.page2 { break-before: page; }
.verdict-meta { margin-top: 0.45rem; padding-top: 0.35rem; border-top: 1px solid #cfe3d6; font-size: 0.92rem; }
.lvl-high, .lvl-direct, .lvl-likely, .lvl-now { color: var(--green); font-weight: 650; }
.lvl-uncertain, .lvl-medium, .lvl-soon, .lvl-through { color: var(--amber); font-weight: 650; }
.lvl-low, .lvl-tight, .lvl-later, .lvl-unclear { color: var(--red); font-weight: 650; }
.pitch-quote { font-size: 1.08rem; color: var(--ink); }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.35rem; margin-top: 0.75rem; }
table.fixes { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
table.fixes th { text-align: left; font-size: 0.74rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: 650; padding: 0 0.3rem 0.25rem 0; border-bottom: 1.5px solid var(--ink); }
table.fixes td { padding: 0.24rem 0.3rem 0.24rem 0; border-bottom: 1px solid var(--line); vertical-align: top; }
table.fixes td:first-child { font-weight: 650; color: var(--ink); width: 34%; }
table.fixes td:last-child, table.fixes th:last-child { text-align: center; font-weight: 700; color: var(--ink); width: 13%; }
ol.steps { list-style: none; margin: 0; padding: 0; counter-reset: step; }
ol.steps li { position: relative; padding-left: 1.75rem; margin-bottom: 0.4rem; }
ol.steps li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 0.05rem; width: 1.2rem; height: 1.2rem; border-radius: 50%; background: var(--navy); color: #fff; font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.says p { margin-bottom: 0.32rem; padding-bottom: 0.32rem; border-bottom: 1px solid var(--line); }
.says p:last-child { border-bottom: 0; }
.offer { border: 1px solid var(--line); border-radius: 3px; padding: 0.45rem 0.6rem 0.5rem; margin-bottom: 0.45rem; break-inside: avoid; }
.offer.lead { border-color: var(--navy); background: var(--blue-soft); }
.offer .head { display: flex; align-items: baseline; gap: 0.4rem; }
.offer .head b { font-size: 1.04rem; color: var(--navy); }
.offer .head .dur { color: var(--muted); font-size: 0.85rem; }
.offer .head .price { margin-left: auto; font-weight: 700; color: var(--ink); white-space: nowrap; }
.badge { display: inline-block; background: var(--navy); color: #fff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.08rem 0.4rem; border-radius: 2px; margin-right: 0.3rem; }
.note { font-style: italic; color: var(--muted); }
.monthly { font-size: 0.92rem; margin-top: 0.15rem; }
`;

const ONEPAGER_CSS = `
html { font-size: calc(10.4pt * var(--scale)); }
h1 { font-size: 3.1rem; margin-top: 0.3rem; }
.sub { font-size: 1.2rem; }
.intro { color: var(--muted); font-size: 1.08rem; margin-top: 0.5rem; max-width: 82%; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-top: 0.4rem; }
.card { border: 1px solid var(--line); border-radius: 4px; padding: 0.8rem 0.9rem 0.85rem 3.1rem; position: relative; break-inside: avoid; }
.card .num { position: absolute; left: 0.85rem; top: 0.85rem; width: 1.55rem; height: 1.55rem; border-radius: 50%; background: var(--red-soft); border: 1px solid #f0c4be; color: var(--red); font-weight: 700; font-size: 0.86rem; display: flex; align-items: center; justify-content: center; }
.card h3 { margin: 0 0 0.25rem; font-size: 1.22rem; color: var(--navy); font-weight: 650; }
.card .fix { margin-top: 0.35rem; }
.card .fix b { color: var(--green); }
.change { background: var(--blue-soft); border: 1px solid #d5dfeb; border-radius: 4px; padding: 0.8rem 1rem 0.9rem; margin-top: 1rem; break-inside: avoid; }
.change .eyebrow { color: var(--navy); }
.change .lists { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1.2rem; align-items: center; margin-top: 0.4rem; }
.change h4 { margin: 0 0 0.25rem; font-size: 1.15rem; }
.change .today h4 { color: var(--red); }
.change .after h4 { color: var(--green); }
.change ul { margin: 0; padding-left: 1.1rem; }
.change li { margin-bottom: 0.15rem; }
.arrow { font-size: 1.7rem; color: var(--navy); }
.next { border: 1px dashed var(--line); border-radius: 4px; padding: 0.75rem 0.9rem; margin-top: 1rem; font-size: 1.08rem; break-inside: avoid; }
`;

/** On screen only: how to save the page as a PDF with the browser (where the server can't print). */
const PRINT_HINT = `<div class="print-hint">To save this as a PDF: press <b>Ctrl+P</b> (<b>⌘P</b> on a Mac), choose <b>Save as PDF</b>, then <b>Save</b>. It prints on A4 exactly as shown.</div>`;
const PRINT_HINT_CSS = `.print-hint { position: sticky; top: 0; z-index: 5; margin: -14mm -15mm 10mm; padding: 10px 15mm; background: #17365d; color: #fff; font-size: 13px; } .print-hint b { color: #fff; } @media print { .print-hint { display: none; } }`;

function page({ title, css, footerLeft, footerRight = true, scale = 1, fonts = '', print = false, body }) {
  const right = footerRight ? `@bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; font-size: 7.5pt; color: #9aa3af; }` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${esc(title)}</title>
<style>
${fonts}
@page { size: A4; margin: 14mm 15mm 15mm; @bottom-left { content: ${cssString(footerLeft)}; font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; font-size: 7.5pt; color: #9aa3af; } ${right} }
:root { --scale: ${Number(scale) || 1}; }
${BASE_CSS}
${css}
${print ? PRINT_HINT_CSS : ''}
</style></head><body>${print ? PRINT_HINT : ''}${body}</body></html>`;
}

const bulletClass = (mark) => (mark === 'cross' ? 'cross' : mark === 'tick' ? 'tick' : '');

/** Bold lead-ins and the word “Probably” as the reference shows them. */
function bulletHtml(bullet) {
  const textValue = esc(bullet.text).replace(/^(Probably|Probable|Possibly)\b/, '<span class="probable">$1</span>');
  return `<li class="${bulletClass(bullet.mark)}">${bullet.lead ? `<b>${esc(bullet.lead)}</b> ` : ''}${textValue}</li>`;
}

/** Facts-as-of line: the place, the person, the date. */
export function subtitleOf(input, date) {
  return [input.address || [input.city, input.pincode].filter(Boolean).join(' '), input.person && `${input.role || 'Contact'}: ${input.person}`, `Facts as of ${date}`].filter(Boolean).join('  ·  ');
}

/** The two-page internal summary. */
export function summaryHtml({ input, doc, date, scale = 1, fonts = '', print = false }) {
  const name = input.business;
  const footer = `${name} · Summary of the lead and the pitch · ${date} · Internal, not for sharing`;
  const tiles = (doc.tiles ?? []).slice(0, 6);
  const sections = doc.sections ?? [];
  const verdict = doc.verdict ?? {};
  const meta = [['Need', verdict.need], ['Access', verdict.access], ['Budget', verdict.budget], ['Timing', verdict.timing]].filter(([, value]) => value);
  const offers = doc.offers ?? [];
  const lead = offers.find((offer) => offer.lead);
  let n = 0;
  const sectionHtml = (title, inner, small = '') => `<section class="sec"><h3><span class="n">${++n}</span>${esc(title)}${small ? `<small>${esc(small)}</small>` : ''}</h3>${inner}</section>`;

  const part1 = `
  <div class="eyebrow">Two-page summary · Internal, not for sharing</div>
  <h1>${esc(doc.title || `${name}: the lead and the pitch`)}</h1>
  <div class="sub">${esc(subtitleOf(input, date))}</div>
  <div class="sub2">Researched from public web pages, Google Maps and public registries; every fact was checked against its source.</div>
  <div class="rule"></div>
  <div class="callouts">
    <div class="callout red"><div class="eyebrow">The fact that shapes everything</div><h2>${esc(doc.keyFact?.heading)}</h2><p>${esc(doc.keyFact?.text)}</p></div>
    <div class="callout green"><div class="eyebrow">Bottom line</div><h2>${esc(doc.bottomLine?.heading)}</h2><p>${esc(doc.bottomLine?.text)}</p></div>
  </div>
  ${tiles.length ? `<div class="tiles">${tiles.map((tile) => `<div class="tile"><div class="v">${esc(tile.value)}</div><div class="l">${esc(tile.label)}</div></div>`).join('')}</div>` : '<div style="height:0.8rem"></div>'}
  <div class="part"><span>Part 1 · The lead: what we found</span></div>
  <div class="cols">
    ${sections.map((section) => sectionHtml(section.title, `<ul class="facts">${(section.bullets ?? []).map(bulletHtml).join('')}</ul>`)).join('')}
    ${doc.limits ? `<div class="limits"><b>Limits:</b> ${esc(doc.limits)}</div>` : ''}
  </div>`;

  const left = [
    (doc.fixes ?? []).length && sectionHtml('What’s broken, and your fix', `<table class="fixes"><thead><tr><th>Today</th><th>Your fix</th><th>Offer</th></tr></thead><tbody>${doc.fixes.map((row) => `<tr><td>${esc(row.today)}</td><td>${esc(row.fix)}</td><td>${esc(row.offer)}</td></tr>`).join('')}</tbody></table>`),
    (doc.steps ?? []).length && sectionHtml('Step by step', `<ol class="steps">${doc.steps.map((step) => `<li><b>${esc(step.title)}:</b> ${esc(step.text)}</li>`).join('')}</ol>`),
    (doc.objections ?? []).length && sectionHtml('If they say…', `<div class="says">${doc.objections.map((item) => `<p><b>“${esc(item.says.replace(/^[“"]|[”"]$/g, ''))}”</b> → ${esc(item.reply)}</p>`).join('')}</div>`),
  ].filter(Boolean);
  const right = [
    offers.length && sectionHtml('What to offer', `${offers.map((offer) => `<div class="offer${offer === lead ? ' lead' : ''}"><div class="head"><b>${esc(offer.code)} · ${esc(offer.name)}</b><span class="dur">${esc(offer.duration)}</span><span class="price">${esc(offer.price)}</span></div><p>${offer === lead ? '<span class="badge">Lead with this</span>' : ''}${esc(offer.text)}${offer.note ? ` <span class="note">${esc(offer.note)}</span>` : ''}</p></div>`).join('')}${doc.monthly ? `<p class="monthly"><b>${esc(doc.monthly.split(':')[0])}:</b>${esc(doc.monthly.split(':').slice(1).join(':'))}</p>` : ''}`, 'suggested prices; set your own in Settings'),
    (doc.say ?? []).length && sectionHtml('What to say', `<ul class="facts">${doc.say.map((item) => bulletHtml({ lead: item.lead, text: item.text, mark: 'dot' })).join('')}</ul>`),
    (doc.donts ?? []).length && sectionHtml('Don’ts', `<ul class="facts">${doc.donts.map((item) => `<li class="${item.ok ? 'tick' : 'cross'}">${esc(item.text)}</li>`).join('')}</ul>`),
    sectionHtml('Which file goes where', `<ul class="facts"><li class="tick"><b>Send to the business:</b> ${esc(`${name} – Online Health Check`)}, one page, with nothing internal in it.</li><li class="cross"><b>Keep to yourself:</b> this summary.</li></ul>`),
  ].filter(Boolean);

  const part2 = `
  <div class="page2">
  <div class="part"><span>Part 2 · The pitch: what to do</span></div>
  <div class="callouts">
    <div class="callout green"><div class="eyebrow">Should you approach them?</div><h2>${esc(verdict.heading)}</h2><p>${esc(verdict.text)}</p>${meta.length ? `<div class="verdict-meta">${meta.map(([label, value]) => `${label} <span class="lvl-${esc(String(value).split(' ')[0])}">${esc(value)}</span>`).join(' · ')}</div>` : ''}</div>
    <div class="callout blue"><div class="eyebrow">Your pitch in one sentence</div><p class="pitch-quote">“${esc(String(doc.pitchSentence ?? '').replace(/^[“"]|[”"]$/g, ''))}”</p></div>
  </div>
  <div class="grid2"><div>${left.join('')}</div><div>${right.join('')}</div></div>
  </div>`;

  return page({ title: `${name} · Two-page summary`, css: '', footerLeft: footer, scale, fonts, print, body: part1 + part2 });
}

/** The one-page online health check, safe to send to the business. */
export function onePagerHtml({ input, doc, date, scale = 1, fonts = '', print = false }) {
  const name = input.business;
  const audience = doc.audience || 'customers';
  const days = /(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*days?/i.exec(doc.leadDuration ?? '');
  const span = days ? `${days[2] ?? days[1]} days` : 'a few weeks';
  const issues = (doc.issues ?? []).slice(0, 6);
  const body = `
  <div class="eyebrow">Online health check</div>
  <h1>${esc(name)}</h1>
  <div class="sub">What ${esc(audience)} see when they look you up online · Checked ${esc(date)}</div>
  ${doc.intro ? `<p class="intro">${esc(doc.intro)}</p>` : ''}
  <div class="rule"></div>
  <div class="cards">${issues.map((issue, index) => `<div class="card"><div class="num">${index + 1}</div><h3>${esc(issue.title)}</h3><p>${esc(issue.text)}</p><p class="fix"><b>Fix:</b> ${esc(issue.fix)}</p></div>`).join('')}</div>
  ${(doc.today ?? []).length ? `<div class="change"><div class="eyebrow">What ${esc(span)} of work would change</div><div class="lists"><div class="today"><h4>Today</h4><ul>${doc.today.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div><div class="arrow">→</div><div class="after"><h4>In ${esc(span)}</h4><ul>${(doc.after ?? []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div></div></div>` : ''}
  ${doc.nextStep ? `<div class="next"><b>Next step:</b> ${esc(doc.nextStep)}</div>` : ''}`;
  return page({ title: `${name} · Online health check`, css: ONEPAGER_CSS, footerLeft: `Online health check · ${name} · Checked ${date} from public listings`, footerRight: false, scale, fonts, print, body });
}

/** The file names the downloads get, as the reference PDFs were named. */
export function fileNames(business) {
  const slug = String(business ?? 'Business')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'Business';
  return { summary: `${slug}-Two-Page-Summary.pdf`, onepager: `${slug}-Online-Health-Check.pdf` };
}
