'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ShareViewer } from './_components/ShareViewer';
import { SharePageWrapper } from './_components/SharePageWrapper';

export default function SharePage() {
  const params = useParams();
  const shareId = params?.shareId as string;

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
