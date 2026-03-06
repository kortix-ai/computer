'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function EnterprisePage() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          Coming soon.
        </h1>
        <p className="text-sm text-muted-foreground">
          Interested in Kortix for your team?{' '}
          <a
            href="mailto:hey@kortix.ai"
            className="text-foreground underline underline-offset-4 hover:no-underline"
          >
            hey@kortix.ai
          </a>
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ArrowRight className="mr-1.5 size-3.5 rotate-180" />
            Back
          </Link>
        </Button>
      </div>
    </div>
  );
}
