import type { Metadata } from 'next';
import { ShareViewer } from './_components/ShareViewer';
import { SharePageWrapper } from './_components/SharePageWrapper';

export const metadata: Metadata = {
  title: 'Shared Conversation',
  description: 'View a shared Kortix conversation in read-only mode.',
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;

  if (!shareId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Invalid share link.</p>
      </div>
    );
  }

  return (
    <SharePageWrapper>
      <ShareViewer shareId={shareId} />
    </SharePageWrapper>
  );
}
