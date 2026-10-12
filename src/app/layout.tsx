import type { Metadata, Viewport } from 'next';
import { Inter, Red_Hat_Display } from 'next/font/google';
import './globals.css';
import { SmoothScroll } from '@/components/layout/SmoothScroll';
import { Cursor } from '@/components/layout/Cursor';
import { Navbar } from '@/components/layout/Navbar';

/**
 * The reference ships Framer's "Inter Display". Inter's variable release
 * carries the same optical-size axis, so enabling it reproduces the display
 * cut at large sizes without licensing a separate family.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  axes: ['opsz'],
});

/**
 * The landing and the sections after it. Red Hat Display is the closest open
 * match to the Figma comp's geometric sans — same proportions and stroke weight.
 */
const redHat = Red_Hat_Display({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-red-hat',
  display: 'swap',
});

/**
 * Runs before first paint: decides whether the landing reel plays and keeps the
 * page at the top while it does. Deep links and reduced motion skip straight to
 * the slides. `src/lib/intro.ts` reads the flag it leaves on <html>.
 */
const introBootScript = `(function(){try{var d=document.documentElement;var skip=location.pathname!=='/'||!!location.hash||matchMedia('(prefers-reduced-motion: reduce)').matches;d.dataset.intro=skip?'skip':'playing';if(!skip&&'scrollRestoration' in history)history.scrollRestoration='manual';}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'Atlas Studios — Gulafsan Shaheen',
  description:
    'Atlas Studios is the portfolio of Gulafsan Shaheen, an economics-trained designer building brands, UX and systems people remember — from field research to identity, packaging and digital experiences.',
  openGraph: {
    title: 'Atlas Studios — Gulafsan Shaheen',
    description: 'Brand identity, UX research and product design by Gulafsan Shaheen.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#020923',
  width: 'device-width',
  initialScale: 1,
};

/**
 * `modal` is the slot a project fills when it is opened from the home page
 * (app/@modal/(.)work/[slug]): the URL becomes /work/<slug> while the page
 * underneath stays put.
 */
export default function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    // The boot script writes data-intro onto <html> before React hydrates.
    <html lang="en" className={`${inter.variable} ${redHat.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introBootScript }} />
      </head>
      <body>
        <SmoothScroll />
        <Cursor />
        <Navbar />
        {children}
        {modal}
      </body>
    </html>
  );
}
