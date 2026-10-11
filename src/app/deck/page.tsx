import type { Metadata } from 'next';
import { PageLight } from '@/components/layout/PageLight';
import { DeckViewer } from '@/components/deck/DeckViewer';

export const metadata: Metadata = {
  title: 'The deck — Atlas Studios',
  description: 'The Atlas Studio deck: how the studio thinks and the work it has made.',
};

export default function DeckPage() {
  return (
    <>
      <PageLight />
      <DeckViewer />
    </>
  );
}
