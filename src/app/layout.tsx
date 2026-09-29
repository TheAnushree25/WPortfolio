import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SmoothScroll } from '@/components/layout/SmoothScroll';
import { Preloader } from '@/components/layout/Preloader';
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
  themeColor: '#095cfb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Preloader />
        <SmoothScroll />
        <Cursor />
        <Navbar />
        {children}
      </body>
    </html>
  );
}
