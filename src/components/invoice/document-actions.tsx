'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DocumentActions() {
  return (
    <div className="no-print mb-4 flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
        <Printer /> Print / Save as PDF
      </Button>
    </div>
  );
}
