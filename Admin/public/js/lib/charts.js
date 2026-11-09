import { h } from './dom.js';

/**
 * Charts drawn as SVG with no library: a line or column chart with a hover
 * read-out, a sparkline, a donut, a score ring, a funnel and labelled bars.
 * Plots stretch to their container; strokes keep their width while they do.
 */

const PALETTE = ['var(--brand)', 'var(--sky)', 'var(--violet)', 'var(--success)', 'var(--warning)', 'var(--danger)', '#7fb0ff', '#f472b6'];
export const seriesColor = (index) => PALETTE[index % PALETTE.length];

const W = 600;

function scaleMax(values) {
  const max = Math.max(1, ...values);
  if (max <= 4) return 4; // small counts keep their proportions instead of filling the chart
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
}

/**
 * series: [{ name, values, color }]; labels: one per point.
 * kind: 'line' (filled area under the first series) or 'bars'.
 */
export function chart({ series, labels, height = 220, kind = 'line', format = (v) => String(v), labelFormat = (l) => l }) {
  const H = height;
  const pad = 6;
  const all = series.flatMap((item) => item.values);
  const max = scaleMax(all);
  const n = labels.length;
  const x = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v) => H - pad - (v / max) * (H - pad * 2);

  const svg = h('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': series.map((item) => item.name).join(', ') });
  for (let i = 1; i <= 3; i++) {
    svg.append(h('line', { x1: 0, x2: W, y1: (H / 4) * i, y2: (H / 4) * i, stroke: 'var(--line)', 'stroke-dasharray': '3 5', 'vector-effect': 'non-scaling-stroke' }));
  }

  if (kind === 'bars') {
    const band = W / Math.max(n, 1);
    const gap = Math.min(10, band * 0.3);
    series.forEach((item, s) => {
      const width = (band - gap) / series.length;
      item.values.forEach((value, i) => {
        const top = y(value);
        svg.append(h('rect', { x: i * band + gap / 2 + s * width, y: top, width: Math.max(1, width), height: Math.max(0, H - pad - top), rx: Math.min(4, width / 2), fill: item.color ?? seriesColor(s), opacity: 0.9 }));
      });
    });
  } else {
    series.forEach((item, s) => {
      const color = item.color ?? seriesColor(s);
      const points = item.values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`);
      if (s === 0) {
        const id = `g${Math.random().toString(36).slice(2, 8)}`;
        svg.append(
          h('defs', h('linearGradient', { id, x1: 0, x2: 0, y1: 0, y2: 1 }, h('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.32 }), h('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }))),
          h('polygon', { points: `0,${H} ${points.join(' ')} ${W},${H}`, fill: `url(#${id})` }),
        );
      }
      svg.append(h('polyline', { points: points.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
    });
  }

  const plot = h('div', { style: { height: `${H}px`, position: 'relative' } }, svg);
  const tip = h('div.chart-tip.hidden');
  const guide = h('div.chart-guide.hidden');
  const marks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, list) => list.indexOf(v) === i && v >= 0);
  const axis = h('div.axis', marks.map((i) => h('span', labelFormat(labels[i] ?? ''))));
  const wrap = h('div.chart', plot, guide, tip, axis);

  const show = (event) => {
    const rect = plot.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const i = kind === 'bars' ? Math.min(n - 1, Math.floor(ratio * n)) : Math.round(ratio * (n - 1));
    if (i < 0 || i >= n) return;
    const left = kind === 'bars' ? ((i + 0.5) / n) * rect.width : n <= 1 ? rect.width / 2 : (i / (n - 1)) * rect.width;
    tip.replaceChildren(
      h('div.muted.tiny', labelFormat(labels[i])),
      ...series.map((item, s) => h('div', h('span.swatch', { style: { background: item.color ?? seriesColor(s), marginRight: '6px' } }), `${item.name}: `, h('b', format(item.values[i])))),
    );
    tip.classList.remove('hidden');
    guide.classList.remove('hidden');
    guide.style.left = `${left}px`;
    const tipWidth = tip.offsetWidth;
    tip.style.left = `${Math.min(rect.width - tipWidth / 2, Math.max(tipWidth / 2, left))}px`;
  };
  const hide = () => {
    tip.classList.add('hidden');
    guide.classList.add('hidden');
  };
  plot.addEventListener('pointermove', show);
  plot.addEventListener('pointerdown', show);
  plot.addEventListener('pointerleave', hide);
  return wrap;
}

export function sparkline(values, { color = 'var(--brand)', height = 46 } = {}) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const points = values.map((value, i) => `${((i / Math.max(1, n - 1)) * 100).toFixed(2)},${(height - 4 - (value / max) * (height - 8)).toFixed(2)}`);
  const id = `s${Math.random().toString(36).slice(2, 8)}`;
  return h(
    'svg.spark',
    { viewBox: `0 0 100 ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    h('defs', h('linearGradient', { id, x1: 0, x2: 0, y1: 0, y2: 1 }, h('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.35 }), h('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }))),
    h('polygon', { points: `0,${height} ${points.join(' ')} 100,${height}`, fill: `url(#${id})` }),
    h('polyline', { points: points.join(' '), fill: 'none', stroke: color, 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke' }),
  );
}

/** segments: [{ label, value, color }] */
export function donut(segments, { size = 150, thickness = 18, centre = null } = {}) {
  const total = segments.reduce((sum, item) => sum + item.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const svg = h('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, style: { transform: 'rotate(-90deg)' }, role: 'img', 'aria-label': segments.map((item) => `${item.label} ${item.value}`).join(', ') });
  svg.append(h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--hover)', 'stroke-width': thickness }));
  segments.forEach((item, i) => {
    const length = (item.value / total) * c;
    svg.append(h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: item.color ?? seriesColor(i), 'stroke-width': thickness, 'stroke-dasharray': `${Math.max(0, length - 2)} ${c}`, 'stroke-dashoffset': -offset, 'stroke-linecap': 'butt' }));
    offset += length;
  });
  return h(
    'div.row.wrap',
    { style: { gap: '20px' } },
    h('div', { style: { position: 'relative', width: `${size}px`, height: `${size}px`, flex: 'none' } }, svg, centre && h('div', { style: { position: 'absolute', inset: '0', display: 'grid', placeContent: 'center', textAlign: 'center' } }, centre)),
    h(
      'div.stack.tight.grow',
      segments.map((item, i) =>
        h('div.row.between.small', h('span.row', { style: { gap: '8px' } }, h('span.swatch', { style: { background: item.color ?? seriesColor(i) } }), item.label), h('b', `${Math.round((item.value / total) * 100)}%`)),
      ),
    ),
  );
}

export function ring(score, { size = 112, label = 'score' } = {}) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
  return h(
    'div.ring',
    { style: { width: `${size}px`, height: `${size}px` } },
    h(
      'svg',
      { viewBox: `0 0 ${size} ${size}`, width: size, height: size },
      h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--hover)', 'stroke-width': 10 }),
      h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': `${(score / 100) * c} ${c}` }),
    ),
    h('div.ring-value', h('b', String(score)), h('span', label)),
  );
}

/** rows: [{ label, count, value?, color }] */
export function funnel(rows, { format = (row) => String(row.count) } = {}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return h(
    'div.funnel',
    rows.map((row, i) =>
      h('div.funnel-row', h('span.muted', row.label), h('div.track', h('i', { style: { width: `${(row.count / max) * 100}%`, background: row.color ?? seriesColor(i) } })), h('b.small', format(row))),
    ),
  );
}

/** rows: [{ label, value, hint? }] as labelled horizontal bars. */
export function bars(rows, { format = (v) => String(v), empty = 'Nothing yet.' } = {}) {
  if (!rows.length) return h('p.muted.small', empty);
  const max = Math.max(1, ...rows.map((row) => row.value));
  return h(
    'div.bars',
    rows.map((row) => h('div.bar-row', h('span.truncate', row.label, row.hint && h('span.muted', ` ${row.hint}`)), h('span.v', format(row.value)), h('div.bar', h('i', { style: { width: `${(row.value / max) * 100}%` } })))),
  );
}
