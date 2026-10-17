'use client';

import { useEffect, type CSSProperties } from 'react';
import { motion, type Variants } from 'motion/react';
import { works } from '@/content/site';
import type { SystemCase } from '@/content/work';
import { ease } from '@/lib/motion';

const words = works.system;

const row: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } };
const swatchIn: Variants = {
  hidden: { opacity: 0, y: 40, clipPath: 'inset(100% 0 0 0 round 14px)' },
  shown: { opacity: 1, y: 0, clipPath: 'inset(0% 0 0 0 round 14px)', transition: { duration: 1.1, ease: ease.expo } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.9, ease: ease.expo } },
};

/** Whether light text reads on a colour (relative luminance, WCAG). */
function isDark(hex: string) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, '$&$&') : value.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((at) => {
    const channel = parseInt(full.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.36;
}

/** Google Fonts asked for so far, so each face is fetched once. */
const requested = new Set<string>();

/**
 * The design language: the palette as a row of colour that opens up under the
 * pointer, the typefaces set in themselves (fetched from Google Fonts as the
 * chapter comes near), and the principles the interface keeps to.
 */
export function Design({ study, active }: { study: SystemCase; active: boolean }) {
  const { palette, faces, notes } = study.design;

  useEffect(() => {
    if (!active) return;
    for (const face of faces) {
      if (!face.google || requested.has(face.google)) continue;
      requested.add(face.google);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${face.google}&display=swap`;
      document.head.appendChild(link);
    }
  }, [active, faces]);

  return (
    <div className="sys-design">
      <p className="sys-kicker">{words.palette}</p>
      <motion.ul className="sys-palette" variants={row} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.3 }}>
        {palette.map((swatch) => (
          <motion.li
            key={swatch.hex + swatch.name}
            className="sys-swatch"
            variants={swatchIn}
            style={{ '--swatch': swatch.hex, color: isDark(swatch.hex) ? '#fff' : 'var(--color-night)' } as CSSProperties}
          >
            <span className="sys-swatch-name">{swatch.name}</span>
            <span className="sys-swatch-hex">{swatch.hex.toUpperCase()}</span>
            <span className="sys-swatch-role">{swatch.role}</span>
          </motion.li>
        ))}
      </motion.ul>

      <p className="sys-kicker">{words.type}</p>
      <motion.ul className="sys-faces" variants={row} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.25 }}>
        {faces.map((face) => (
          <motion.li key={face.family} className="sys-face" variants={rise}>
            <span aria-hidden className="sys-face-glyph" style={{ fontFamily: face.stack }}>
              Aa
            </span>
            <span className="sys-face-family">{face.family}</span>
            <span className="sys-face-role">{face.role}</span>
            <span className="sys-face-sample" style={{ fontFamily: face.stack }}>
              {face.sample}
            </span>
            {face.note && <span className="sys-face-note">{face.note}</span>}
          </motion.li>
        ))}
      </motion.ul>

      {notes.length > 0 && (
        <>
          <p className="sys-kicker">{words.principles}</p>
          <motion.ol className="sys-notes" variants={row} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.3 }}>
            {notes.map((note, index) => (
              <motion.li key={note} className="sys-note" variants={rise}>
                <span className="sys-note-num">{String(index + 1).padStart(2, '0')}</span>
                <span>{note}</span>
              </motion.li>
            ))}
          </motion.ol>
        </>
      )}
    </div>
  );
}
