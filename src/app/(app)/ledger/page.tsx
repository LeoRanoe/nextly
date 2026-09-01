import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LedgerSheet } from '@/components/forms/ledger-sheet';
import { LedgerActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableSkeleton,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { formatDate, humanise } from '@/lib/format';
import { listLedger } from '@/server/queries/lists';
import { listPrincipalOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Cash ledger' };

const CATEGORY_TONE: Record<string, 'positive' | 'negative' | 'accent' | 'neutral'> = {
  owner_contribution: 'accent',
  owner_draw: 'neutral',
  sales_receipt: 'positive',
  purchase: 'negative',
  shipping: 'negative',
  operating: 'negative',
  refund: 'neutral',
  other: 'neutral',
};

export default function LedgerPage() {
  return (
    <>
      <PageHeader
        title="Cash ledger"
        description="Append-only. Corrections are made with a reversing entry, never by editing history, and the running balance is computed rather than stored so it cannot go stale."
        action={
          <Suspense
            fallback={
              <Button variant="primary" disabled>
                Record movement
              </Button>
            }
          >
            <LedgerTrigger />
          </Suspense>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton rows={5} widths={['w-20', 'w-40', 'w-16']} />}>
          <LedgerTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function LedgerTable() {
  const rows = await listLedger();

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Wallet}
        title="No cash movements yet"
        description="Owner contributions, supplier payments and sales receipts all land here. Entries caused by a document are posted automatically from that document."
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH className="w-[92px]">Date</TH>
            <TH>Description</TH>
            <TH>Category</TH>
            <TH>Owner</TH>
            <TH>Method</TH>
            <TH numeric>Amount</TH>
            <TH numeric>Balance</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                {formatDate(row.occurredAt)}
              </TD>
              <TD className="text-ink">{row.description}</TD>
              <TD>
                <Badge tone={CATEGORY_TONE[row.category] ?? 'neutral'}>
                  {humanise(row.category)}
                </Badge>
              </TD>
              <TD className="whitespace-nowrap text-ink-3">{row.memberName ?? '—'}</TD>
              <TD className="whitespace-nowrap text-[12px] text-ink-4">
                {humanise(row.paymentMethod)}
              </TD>
              <TD numeric>
                <Money cents={row.netCents} tone="flow" size="sm" signed />
              </TD>
              <TD numeric className="text-ink-2">
                <Money cents={row.balanceCents} size="sm" tone="muted" />
              </TD>
              <TD className="text-right">
                <LedgerActions id={row.id} description={row.description} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

async function LedgerTrigger() {
  const principals = await listPrincipalOptions();
  return <LedgerSheet principals={principals} />;
}
