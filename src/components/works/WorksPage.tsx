'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { works, worksPage } from '@/content/site';
import { ease } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { FocusText } from '@/components/ui/FocusText';
import { CardRow, type RowCard } from '@/components/work/CardRow';
import { ProjectStage } from '@/components/work/ProjectStage';
import { FilterChips, Filters, type FilterState } from './Filters';
import { ScreeningRoom, type Reel, type RoomFocus } from './ScreeningRoom';

/** A card on the work page: the row's card, with what it can be filtered by. */
export type WorkCard = RowCard & { industry: string; accent: string; opens: boolean };

type WorksPageProps = { systems: WorkCard[]; designs: WorkCard[]; reels: Reel[] };

type RowKey = 'systems' | 'design';
const DISCIPLINES = [
  { key: 'systems', label: worksPage.rows.systems.title },
  { key: 'design', label: worksPage.rows.design.title },
] as const;
const LABELS = Object.fromEntries(DISCIPLINES.map((item) => [item.key, item.label]));

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The work page, after Studio Mirage's: the title and its filters over a
 * screening room, the index of the two kinds of work in Mirage's hairline
 * rows, then each kind as a row of cards travelling sideways — the systems as
 * screens, the identities as the posters from the landing. Pointing at an
 * index row plays that work on every screen; a card opens its project.
 */
export function WorksPage({ systems, designs, reels }: WorksPageProps) {
  const [filters, setFilters] = useState<FilterState>({ disciplines: new Set(), industries: new Set() });
  const [focus, setFocus] = useState<RoomFocus>(null);
  const [hovered, setHovered] = useState<Record<RowKey, RowCard | null>>({ systems: null, design: null });

  const matches = useCallback(
    (row: RowKey, card: WorkCard) =>
      (!filters.disciplines.size || filters.disciplines.has(row)) && (!filters.industries.size || filters.industries.has(card.industry)),
    [filters],
  );
  const shownSystems = useMemo(() => systems.filter((card) => matches('systems', card)), [matches, systems]);
  const shownDesigns = useMemo(() => designs.filter((card) => matches('design', card)), [designs, matches]);
  const shownSlugs = useMemo(() => new Set([...shownSystems, ...shownDesigns].map((card) => card.slug)), [shownDesigns, shownSystems]);
  const programme = useMemo(() => {
    const list = reels.filter((reel) => shownSlugs.has(reel.slug));
    return list.length ? list : reels;
  }, [reels, shownSlugs]);
  const industries = useMemo(() => [...new Set([...systems, ...designs].map((card) => card.industry))].sort(), [designs, systems]);

  const opensSystem = useCallback(() => true, []);
  const designOpens = useMemo(() => new Set(designs.filter((card) => card.opens).map((card) => card.slug)), [designs]);
  const opensDesign = useCallback((slug: string) => designOpens.has(slug), [designOpens]);
  const hoverSystems = useCallback((card: RowCard | null) => setHovered((state) => ({ ...state, systems: card })), []);
  const hoverDesign = useCallback((card: RowCard | null) => setHovered((state) => ({ ...state, design: card })), []);

  const rows = [
    { key: 'systems' as const, content: worksPage.rows.systems, cards: shownSystems, discipline: 'system' as const },
    { key: 'design' as const, content: worksPage.rows.design, cards: shownDesigns, discipline: 'design' as const },
  ];
  const nothing = !shownSystems.length && !shownDesigns.length;

  return (
    <>
      <section id="home" data-nav-tone="dark" className="works-hero relative z-10" aria-labelledby="works-title">
        <motion.div className="works-head" initial="hidden" animate="shown">
          <div className="works-head-title">
            <FocusText as="h1" text={worksPage.title} delay={0.15} step={0.035} className="works-title" />
            <motion.p
              className="works-intro"
              variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.9, ease: ease.expo, delay: 0.55 } } }}
            >
              {worksPage.intro}
            </motion.p>
          </div>
          <motion.div variants={{ hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.6, delay: 0.7 } } }}>
            <Filters disciplines={DISCIPLINES} industries={industries} value={filters} onChange={setFilters} />
          </motion.div>
        </motion.div>
        <FilterChips value={filters} labels={LABELS} onChange={setFilters} />

        <ScreeningRoom reels={programme} focus={focus} />

        <IndexRows rows={rows} onFocus={setFocus} />
        {nothing && <p className="works-empty">{worksPage.filters.none}</p>}
      </section>

      {rows.map((row) =>
        row.cards.length ? (
          <CardRow
            key={row.key}
            id={row.content.id}
            cards={row.cards}
            opens={row.key === 'systems' ? opensSystem : opensDesign}
            shape={row.key === 'systems' ? 'screen' : 'poster'}
            viewer={row.key === 'systems' ? 'system' : 'design'}
            cta={row.key === 'systems' ? works.system.cta : works.cta}
            dim
            onHover={row.key === 'systems' ? hoverSystems : hoverDesign}
            className="works-band"
            header={<BandHead content={row.content} count={row.cards.length} hovered={hovered[row.key]} cards={row.cards} />}
          />
        ) : null,
      )}

      <ProjectStage />
    </>
  );
}

type RowContent = (typeof worksPage.rows)[RowKey];

/**
 * Mirage's index rows, one per kind of work: its name, what its case studies
 * show, and how many there are. Pointing at a row plays that work in the
 * screening room and dims the other; a light runs along the hairlines near
 * the pointer. A row glides to its cards.
 */
function IndexRows({ rows, onFocus }: { rows: { key: RowKey; content: RowContent; cards: WorkCard[]; discipline: 'system' | 'design' }[]; onFocus: (focus: RoomFocus) => void }) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    let x = -9999;
    let y = -9999;
    const paint = () => {
      frame = 0;
      const box = list.getBoundingClientRect();
      list.style.setProperty('--mx', `${Math.round(x - box.left)}px`);
      for (const line of list.querySelectorAll<HTMLElement>('[data-line]')) {
        const at = line.getBoundingClientRect().top;
        line.style.setProperty('--glow', String(Math.max(0, 1 - Math.abs(y - at) / 120).toFixed(3)));
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      y = -9999;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    list.addEventListener('pointermove', move, { passive: true });
    list.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener('pointermove', move);
      list.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <motion.ul
      ref={listRef}
      className="works-index"
      initial="hidden"
      animate="shown"
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.12, delayChildren: 0.9 } } }}
      onPointerLeave={() => onFocus(null)}
    >
      {rows.map((row) => (
        <motion.li
          key={row.key}
          className={cn('works-index-item', !row.cards.length && 'is-empty')}
          variants={{ hidden: { opacity: 0, y: 20 }, shown: { opacity: 1, y: 0, transition: { duration: 0.9, ease: ease.expo } } }}
          onPointerEnter={() => onFocus({ discipline: row.discipline })}
        >
          <span aria-hidden data-line className="works-index-line" />
          <a href={`#${row.content.id}`} className="works-index-link" onFocus={() => onFocus({ discipline: row.discipline })} onBlur={() => onFocus(null)}>
            <span className="works-index-name">
              <span className="works-index-num">{row.content.number}</span>
              <span className="works-index-title">{row.content.title}</span>
            </span>
            <span className="works-index-infos">
              <span className="works-index-tags">
                {row.content.tags.map((tag) => (
                  <span key={tag} className="works-tag">
                    {tag}
                  </span>
                ))}
              </span>
              <span className="works-pill">
                {pad(row.cards.length)} {row.cards.length === 1 ? 'project' : 'projects'}
              </span>
            </span>
          </a>
        </motion.li>
      ))}
      <li aria-hidden className="works-index-end">
        <span data-line className="works-index-line" />
      </li>
    </motion.ul>
  );
}

/** A row's heading, in Mirage's list style: its name, its line, and the card the pointer is on. */
function BandHead({ content, count, hovered, cards }: { content: RowContent; count: number; hovered: RowCard | null; cards: WorkCard[] }) {
  const card = hovered ? cards.find((item) => item.slug === hovered.slug) : null;
  return (
    <motion.header
      className="works-band-head"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.4, ease: 'linear' }}
    >
      <div className="works-band-title">
        <span className="works-band-num">{content.number}</span>
        <h2>{content.title}</h2>
        <p className="works-band-line">{content.line}</p>
      </div>
      <div className="works-band-meta">
        <AnimatePresence mode="popLayout" initial={false}>
          {card ? (
            <motion.span
              key={card.slug}
              className="works-band-now"
              initial={{ y: '60%', opacity: 0, filter: 'blur(6px)' }}
              animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: '-60%', opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.45, ease: ease.expo }}
            >
              <span className="works-band-now-title">{card.title}</span>
              <span className="works-band-now-kind">{card.kind}</span>
              <span className="works-industry" style={{ '--industry': card.accent } as CSSProperties}>
                {card.industry}
              </span>
            </motion.span>
          ) : (
            <motion.span
              key="tags"
              className="works-band-tags"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {content.tags.map((tag) => (
                <span key={tag} className="works-tag">
                  {tag}
                </span>
              ))}
            </motion.span>
          )}
        </AnimatePresence>
        <span className="works-pill">{pad(count)}</span>
      </div>
    </motion.header>
  );
}
