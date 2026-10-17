'use client';

import type { CSSProperties } from 'react';
import { motion, type Variants } from 'motion/react';
import type { PlanNode } from '@/content/systems';
import type { SystemCase } from '@/content/work';
import { ease } from '@/lib/motion';

const tree: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const branch: Variants = {
  hidden: { opacity: 0, y: 22, filter: 'blur(8px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: ease.expo, staggerChildren: 0.05, delayChildren: 0.25 }, transitionEnd: { filter: 'none' } },
};
const leaf: Variants = {
  hidden: { opacity: 0, x: -8 },
  shown: { opacity: 1, x: 0, transition: { duration: 0.6, ease: ease.expo } },
};

/** Counts the pages under a node, itself included when it has none of its own. */
const pagesIn = (node: PlanNode): number => (node.children?.length ? node.children.reduce((sum, child) => sum + pagesIn(child), 0) : 1);

/**
 * The site map, drawn as it is planned: the product at the root, its areas
 * branching off a rail, and every page listed under the area it belongs to.
 * The lines draw themselves as the tree comes into view.
 */
export function Plan({ study }: { study: SystemCase }) {
  const root = study.plan.root;
  const areas = root.children ?? [];
  return (
    <motion.div className="sys-plan" variants={tree} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.2 }}>
      <motion.div className="sys-plan-root" variants={branch}>
        <span className="sys-plan-root-label">{root.label}</span>
        {root.detail && <span className="sys-plan-root-detail">{root.detail}</span>}
        <span className="sys-plan-root-count">
          {areas.length} areas · {pagesIn(root)} screens
        </span>
      </motion.div>
      <ul className="sys-plan-areas" style={{ '--areas': areas.length } as CSSProperties}>
        {areas.map((area, index) => (
          <motion.li key={area.label} className="sys-plan-area" variants={branch}>
            <span className="sys-plan-area-head">
              <span className="sys-plan-area-num">{String(index + 1).padStart(2, '0')}</span>
              <span className="sys-plan-area-label">{area.label}</span>
            </span>
            {area.detail && <span className="sys-plan-area-detail">{area.detail}</span>}
            {area.children?.length ? (
              <ul className="sys-plan-pages">
                {area.children.map((page) => (
                  <motion.li key={page.label} className="sys-plan-page" variants={leaf}>
                    <span className="sys-plan-page-label">{page.label}</span>
                    {page.detail && <span className="sys-plan-page-detail">{page.detail}</span>}
                  </motion.li>
                ))}
              </ul>
            ) : null}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}
