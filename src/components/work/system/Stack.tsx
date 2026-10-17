'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { motion, type Variants } from 'motion/react';
import { works } from '@/content/site';
import type { Architecture } from '@/content/systems';
import type { SystemCase } from '@/content/work';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';

const words = works.system;

const layerIn: Variants = {
  hidden: { opacity: 0, y: 30 },
  shown: { opacity: 1, y: 0, transition: { duration: 1, ease: ease.expo, staggerChildren: 0.05, delayChildren: 0.15 } },
};

const tileIn: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.96, filter: 'blur(8px)' },
  shown: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.8, ease: ease.expo }, transitionEnd: { filter: 'none' } },
};

/** A technology's mark: its logo where one is known, else its initials. */
function Mark({ name, icon }: { name: string; icon?: string }) {
  const glyph = icon ? ICONS[icon] : undefined;
  if (glyph) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="sys-tile-logo">
        <path d={glyph} fill="currentColor" />
      </svg>
    );
  }
  const initials = name
    .replace(/[^A-Za-z0-9 .+#-]/g, '')
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span aria-hidden className="sys-tile-logo is-initials">
      {initials || name.slice(0, 2)}
    </span>
  );
}

/**
 * What the system is built with, layer by layer — each technology as a lit
 * tile with what it does here — and then how the pieces talk: the tiers of the
 * architecture with the data running along the wires between them.
 */
export function Stack({ study }: { study: SystemCase }) {
  return (
    <div className="sys-stack">
      <p className="sys-kicker">{words.built}</p>
      <div className="sys-layers">
        {study.stack.map((layer) => (
          <motion.div key={layer.layer} className="sys-layer" variants={layerIn} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.25 }}>
            <h3 className="sys-layer-name">{layer.layer}</h3>
            <ul className="sys-tiles">
              {layer.items.map((item) => (
                <motion.li key={item.name} className="sys-tile" variants={tileIn}>
                  <Mark name={item.name} icon={item.icon} />
                  <span className="sys-tile-copy">
                    <span className="sys-tile-name">{item.name}</span>
                    {item.detail && <span className="sys-tile-detail">{item.detail}</span>}
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <p className="sys-kicker">{words.flow}</p>
      <ArchitectureMap architecture={study.architecture} />
    </div>
  );
}

type Wire = { key: string; d: string };

/**
 * The architecture as tiers left to right (top to bottom on phones). The wires
 * are measured from the boxes themselves, so they meet them wherever the
 * layout puts them; light runs along each one once the map is in view.
 */
function ArchitectureMap({ architecture }: { architecture: Architecture }) {
  const id = useId().replace(/:/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const draw = () => {
      const frame = root.getBoundingClientRect();
      const vertical = getComputedStyle(root).flexDirection === 'column';
      const box = (node: string) => root.querySelector<HTMLElement>(`[data-node="${node}"]`)?.getBoundingClientRect();
      const next: Wire[] = [];
      for (const [from, to] of architecture.links) {
        const a = box(from);
        const b = box(to);
        if (!a || !b) continue;
        let d: string;
        if (vertical) {
          const x1 = a.left + a.width / 2 - frame.left;
          const y1 = a.bottom - frame.top;
          const x2 = b.left + b.width / 2 - frame.left;
          const y2 = b.top - frame.top;
          const mid = (y1 + y2) / 2;
          d = `M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${mid.toFixed(1)} ${x2.toFixed(1)} ${mid.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        } else {
          const forward = b.left >= a.right - 1;
          const x1 = (forward ? a.right : a.left) - frame.left;
          const y1 = a.top + a.height / 2 - frame.top;
          const x2 = (forward ? b.left : b.right) - frame.left;
          const y2 = b.top + b.height / 2 - frame.top;
          const mid = (x1 + x2) / 2;
          d = `M${x1.toFixed(1)} ${y1.toFixed(1)}C${mid.toFixed(1)} ${y1.toFixed(1)} ${mid.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        }
        next.push({ key: `${from}-${to}`, d });
      }
      setWires(next);
      setSize({ width: frame.width, height: frame.height });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    return () => observer.disconnect();
  }, [architecture]);

  return (
    <motion.div
      ref={rootRef}
      className={cn('sys-arch', shown && 'is-shown')}
      onViewportEnter={() => setShown(true)}
      viewport={{ once: true, amount: 0.3 }}
    >
      <svg aria-hidden className="sys-arch-wires" width={size.width} height={size.height} viewBox={`0 0 ${Math.max(1, size.width)} ${Math.max(1, size.height)}`}>
        <defs>
          <linearGradient id={`${id}-wire`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.15" />
            <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.6" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {wires.map((wire, index) => (
          <g key={wire.key} style={{ '--wire': index } as CSSProperties}>
            <path d={wire.d} pathLength={100} className="sys-arch-wire" stroke={`url(#${id}-wire)`} />
            <path d={wire.d} pathLength={100} className="sys-arch-pulse" />
          </g>
        ))}
      </svg>
      {architecture.tiers.map((tier, t) => (
        <div key={tier.label} className="sys-arch-tier" style={{ '--tier': t } as CSSProperties}>
          <p className="sys-arch-tier-name">{tier.label}</p>
          {tier.nodes.map((node) => (
            <div key={node.id} data-node={node.id} className="sys-arch-node">
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
            </div>
          ))}
        </div>
      ))}
    </motion.div>
  );
}
