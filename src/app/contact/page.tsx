import type { Metadata } from 'next';
import { PageLight } from '@/components/layout/PageLight';
import { Booker } from '@/components/contact/Booker';

export const metadata: Metadata = {
  title: 'Book a meeting — Atlas Studios',
  description: 'Pick a time for a 45-minute conversation with The Atlas Studio.',
};

export default function ContactPage() {
  return (
    <>
      <PageLight />
      <Booker />
    </>
  );
}
