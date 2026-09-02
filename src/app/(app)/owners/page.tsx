import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OwnerActions } from '@/components/forms/owner-actions';
import { OwnerEquity } from '@/components/overview/owner-equity';
import { PageHeader } from '@/components/patterns/page-header';
import {
  MobileList,
  MobileRow,
  MobileRowHeader,
  MobileRowMeta,
  MobileRowMetaItem,
} from '@/components/ui/mobile-list';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatPercent } from '@/lib/money';
import { getOwnerEquity } from '@/server/queries/overview';
import { listPrincipalOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Owners' };

export default async function OwnersPage() {
  const principals = await listPrincipalOptions();

  return (
    <>
      <PageHeader
        title="Owners"
        description="The split is computed from capital that actually moved through the ledger. Nobody types a percentage, so the shares cannot disagree with the cash."
        action={<OwnerActions principals={principals} />}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Surface className="overflow-hidden">
          <SurfaceHeader title="Capital account" hint="Contributions less draws" />
          <Suspense fallback={<Skeleton className="m-4 h-24" />}>
            <EquityTable />
          </Suspense>
        </Surface>
        <Surface>
          <SurfaceHeader title="Split" hint="Share of net capital" />
          <Suspense fallback={<Skeleton className="m-4 h-24" />}>
            <OwnerEquity />
          </Suspense>
        </Surface>
      </div>
    </>
  );
}

async function EquityTable() {
  const owners = await getOwnerEquity();

  if (owners.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-ink-4">
        No owner contributions recorded yet. Mark a ledger entry as an owner contribution and
        the capital account builds itself.
      </p>
    );
  }

  const totals = owners.reduce(
    (sum, owner) => ({
      contributed: sum.contributed + owner.contributedCents,
      drawn: sum.drawn + owner.drawnCents,
      net: sum.net + owner.netCents,
    }),
    { contributed: 0, drawn: 0, net: 0 },
  );

  return (
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Owner</TH>
                <TH numeric>Contributed</TH>
                <TH numeric>Drawn</TH>
                <TH numeric>Net capital</TH>
                <TH numeric>Share</TH>
              </TR>
            </THead>
            <TBody>
              {owners.map((owner) => (
                <TR key={owner.memberId}>
                  <TD className="text-ink">{owner.fullName}</TD>
                  <TD numeric>
                    <Money cents={owner.contributedCents} size="sm" />
                  </TD>
                  <TD numeric>
                    <Money cents={owner.drawnCents} size="sm" tone="muted" />
                  </TD>
                  <TD numeric>
                    <Money cents={owner.netCents} size="sm" />
                  </TD>
                  <TD numeric className="text-ink-2">
                    {formatPercent(owner.share, 2)}
                  </TD>
                </TR>
              ))}
            </TBody>
            <tfoot className="border-line-subtle border-t bg-inset/60">
              <tr>
                <td className="h-9 px-3 text-[12px] text-ink-3">Total</td>
                <td className="h-9 px-3 text-right">
                  <Money cents={totals.contributed} size="sm" />
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={totals.drawn} size="sm" tone="muted" />
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={totals.net} size="sm" />
                </td>
                <td className="tabular h-9 px-3 text-right text-[12px] text-ink-3">100.00%</td>
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {owners.map((owner) => (
          <MobileRow key={owner.memberId} interactive={false}>
            <MobileRowHeader>
              <span className="text-[13px] text-ink">{owner.fullName}</span>
              <span className="tabular shrink-0 text-[12px] text-ink-2">
                {formatPercent(owner.share, 2)}
              </span>
            </MobileRowHeader>
            <MobileRowMeta>
              <MobileRowMetaItem label="Contributed">
                <Money cents={owner.contributedCents} size="sm" />
              </MobileRowMetaItem>
              <MobileRowMetaItem label="Drawn">
                <Money cents={owner.drawnCents} size="sm" tone="muted" />
              </MobileRowMetaItem>
              <MobileRowMetaItem label="Net capital">
                <Money cents={owner.netCents} size="sm" />
              </MobileRowMetaItem>
            </MobileRowMeta>
          </MobileRow>
        ))}
      </MobileList>
    </>
  );
}
