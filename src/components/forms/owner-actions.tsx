'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { LedgerSheet } from '@/components/forms/ledger-sheet';
import { Button } from '@/components/ui/button';
import type { Option } from '@/server/queries/pickers';

export function OwnerActions({ principals }: { principals: Option[] }) {
  const [contributionOpen, setContributionOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" onClick={() => setContributionOpen(true)}>
        <ArrowUp className="size-4" /> Record contribution
      </Button>
      <LedgerSheet
        principals={principals}
        lockedCategory="owner_contribution"
        open={contributionOpen}
        onOpenChange={setContributionOpen}
      />
      <Button variant="secondary" onClick={() => setDrawOpen(true)}>
        <ArrowDown className="size-4" /> Record draw
      </Button>
      <LedgerSheet
        principals={principals}
        lockedCategory="owner_draw"
        open={drawOpen}
        onOpenChange={setDrawOpen}
      />
    </div>
  );
}
