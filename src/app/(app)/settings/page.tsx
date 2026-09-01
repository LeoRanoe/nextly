import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatRelative, humanise } from '@/lib/format';
import { formatRate } from '@/lib/fx';
import { getSettings, listMembers, listRates } from '@/server/queries/reference';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await connection();

  return (
    <>
      <PageHeader
        title="Settings"
        description="The exchange rate, the team, and the thresholds the dashboard reads from."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Surface className="overflow-hidden">
          <SurfaceHeader
            title="Exchange rate"
            hint="Versioned. A new rate is a new row, never an edit."
          />
          <Suspense fallback={<Skeleton className="m-4 h-24" />}>
            <RatesTable />
          </Suspense>
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader title="Team" hint="Access is a member row, not a sign-up" />
          <Suspense fallback={<Skeleton className="m-4 h-24" />}>
            <MembersTable />
          </Suspense>
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader title="Business" hint="Currency and thresholds" />
          <Suspense fallback={<Skeleton className="m-4 h-24" />}>
            <BusinessSettings />
          </Suspense>
        </Surface>
      </div>
    </>
  );
}

async function RatesTable() {
  const rows = await listRates();
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[13px] text-ink-4">
        No exchange rate set. Every SRD amount needs one to convert against.
      </p>
    );
  }
  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Effective from</TH>
            <TH numeric>SRD per USD</TH>
            <TH>Source</TH>
            <TH>Age</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row, index) => (
            <TR key={row.id}>
              <TD className="tabular whitespace-nowrap text-ink">
                {formatDate(row.effectiveFrom)}
                {index === 0 ? (
                  <Badge tone="accent" className="ml-2">
                    Current
                  </Badge>
                ) : null}
              </TD>
              <TD numeric>{formatRate(row.rateMicros, 4)}</TD>
              <TD className="text-[12px] text-ink-3">{humanise(row.source)}</TD>
              <TD className="whitespace-nowrap text-[12px] text-ink-4">
                {formatRelative(row.effectiveFrom)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

async function MembersTable() {
  const rows = await listMembers();
  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="text-ink">
                {row.fullName}
                {row.isPrincipal ? (
                  <Badge tone="accent" className="ml-2">
                    Principal
                  </Badge>
                ) : null}
              </TD>
              <TD className="tabular text-[12px] text-ink-3">{row.email}</TD>
              <TD>
                <Badge>{humanise(row.role)}</Badge>
              </TD>
              <TD>
                {row.hasSignedIn ? (
                  <Badge tone="positive">Active</Badge>
                ) : (
                  <Badge tone="warning">Invited</Badge>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

async function BusinessSettings() {
  const settings = await getSettings();
  if (!settings) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-4">Not configured.</p>;
  }
  return (
    <dl className="divide-y divide-line-subtle">
      <Row label="Business name" value={settings.businessName} />
      <Row label="Books currency" value={settings.baseCurrency} />
      <Row label="Display currency" value={settings.displayCurrency} />
      <Row label="Low stock at" value={`${settings.lowStockThreshold} units or fewer`} />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="text-[13px] text-ink">{value}</dd>
    </div>
  );
}
