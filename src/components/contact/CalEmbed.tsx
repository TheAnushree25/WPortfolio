'use client';

import { useEffect, useId } from 'react';

type CalCall = (...args: unknown[]) => void;
type CalQueue = CalCall & { q?: unknown[][]; ns?: Record<string, CalCall>; loaded?: boolean };

declare global {
  interface Window {
    Cal?: CalQueue;
  }
}

const EMBED_SCRIPT = 'https://app.cal.com/embed/embed.js';
const NAMESPACE = 'atlas';

/**
 * Cal.com's embed loader, as their docs give it: calls queue on window.Cal
 * until embed.js arrives and replays them. No package needed.
 */
function calApi(): CalQueue {
  if (window.Cal) return window.Cal;
  const queue = (target: { q?: unknown[][] }, args: unknown[]) => {
    (target.q ??= []).push(args);
  };
  const cal: CalQueue = (...args: unknown[]) => {
    if (!cal.loaded) {
      cal.ns = {};
      cal.q ??= [];
      const script = document.createElement('script');
      script.src = EMBED_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
      cal.loaded = true;
    }
    if (args[0] === 'init') {
      const namespace = args[1];
      if (typeof namespace === 'string') {
        const api: CalQueue = (...inner: unknown[]) => queue(api, inner);
        cal.ns![namespace] ??= api;
        queue(cal.ns![namespace] as CalQueue, args);
        queue(cal, ['initNamespace', namespace]);
        return;
      }
    }
    queue(cal, args);
  };
  window.Cal = cal;
  return cal;
}

/**
 * The real scheduler: Cal.com's month view inline, in the dark theme with the
 * studio's blue as its brand colour and its ground left clear, so the living
 * gradient shows through.
 */
export function CalEmbed({ calLink }: { calLink: string }) {
  const id = `cal-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const cal = calApi();
    cal('init', NAMESPACE, { origin: 'https://cal.com' });
    const api = cal.ns?.[NAMESPACE];
    if (!api) return;
    api('inline', {
      elementOrSelector: `#${id}`,
      calLink,
      config: { layout: 'month_view', theme: 'dark' },
    });
    api('ui', {
      theme: 'dark',
      layout: 'month_view',
      hideEventTypeDetails: false,
      cssVarsPerTheme: {
        dark: {
          'cal-brand': '#095cfb',
          'cal-brand-emphasis': '#0838b9',
          'cal-brand-text': '#ffffff',
          'cal-bg': 'transparent',
          'cal-bg-muted': 'rgb(2 9 35 / 0.55)',
          'cal-bg-subtle': 'rgb(255 255 255 / 0.06)',
          'cal-bg-emphasis': 'rgb(255 255 255 / 0.12)',
          'cal-border': 'rgb(255 255 255 / 0.1)',
          'cal-border-subtle': 'rgb(255 255 255 / 0.08)',
        },
      },
    });
  }, [calLink, id]);

  return <div id={id} className="min-h-[640px] w-full overflow-auto" />;
}
