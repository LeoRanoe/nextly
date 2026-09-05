import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { RateSheet, SettingsSheet } from '@/components/forms/finance-sheets';
import { InviteMemberSheet } from '@/components/forms/invite-member-sheet';
import { MemberActions } from '@/components/forms/row-actions';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import {
  MobileList,
  MobileRow,
  MobileRowHeader,
  MobileRowMeta,
  MobileRowMetaItem,
} from '@/components/ui/mobile-list';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatRelative, humanise } from '@/lib/format';
import { formatRate } from '@/lib/fx';
import { formatMoney } from '@/lib/money';
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
            action={
              <Suspense fallback={null}>
                <RateAction />
              </Suspense>
            }
          />
          <Suspense fallback={<Skeleton className="m-4 h-24" />}>
            <RatesTable />
          </Suspense>
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader
            title="Team"
            hint="Invite people and control what they can change."
            action={
              <Suspense fallback={null}>
                <InviteMemberSheet />
              </Suspense>
            }
          />
          <Suspense fallback={<Skeleton className="m-4 h-24" />}>
            <MembersTable />
          </Suspense>
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader
            title="Business"
            hint="Currency and thresholds"
            action={
              <Suspense fallback={null}>
                <SettingsAction />
              </Suspense>
            }
          />
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
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH />
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
                  <TD className="text-right">
                    <MemberActions
                      id={row.id}
                      fullName={row.fullName}
                      email={row.email}
                      role={row.role}
                      isPrincipal={row.isPrincipal}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {rows.map((row) => (
          <MobileRow key={row.id} interactive={false}>
            <MobileRowHeader>
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">
                  {row.fullName}
                  {row.isPrincipal ? (
                    <Badge tone="accent" className="ml-1.5">
                      Principal
                    </Badge>
                  ) : null}
                </span>
                <span className="tabular block truncate text-[11px] text-ink-4">
                  {row.email}
                </span>
              </span>
              <MemberActions
                id={row.id}
                fullName={row.fullName}
                email={row.email}
                role={row.role}
                isPrincipal={row.isPrincipal}
              />
            </MobileRowHeader>
            <MobileRowMeta className="grid-cols-1">
              <MobileRowMetaItem label="Role">
                <span className="flex items-center gap-1.5">
                  <Badge>{humanise(row.role)}</Badge>
                  {row.hasSignedIn ? (
                    <Badge tone="positive">Active</Badge>
                  ) : (
                    <Badge tone="warning">Invited</Badge>
                  )}
                </span>
              </MobileRowMetaItem>
            </MobileRowMeta>
          </MobileRow>
        ))}
      </MobileList>
    </>
  );
}

async function BusinessSettings() {
  const settings = await getSettings();
  if (!settings) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-4">Not configured.</p>;
  }
  const address = [settings.addressLine, settings.city].filter(Boolean).join(', ');
  return (
    <dl className="divide-y divide-line-subtle">
      <Row label="Business name" value={settings.businessName} />
      {settings.legalName ? <Row label="Legal name" value={settings.legalName} /> : null}
      {address ? <Row label="Address" value={address} /> : null}
      {settings.phone ? <Row label="Phone" value={settings.phone} /> : null}
      {settings.whatsapp ? <Row label="WhatsApp" value={settings.whatsapp} /> : null}
      {settings.email ? <Row label="Email" value={settings.email} /> : null}
      {settings.taxId ? <Row label="Tax / BTW" value={settings.taxId} /> : null}
      <Row label="Books currency" value={settings.baseCurrency} />
      <Row label="Display currency" value={settings.displayCurrency} />
      <Row label="Low stock at" value={`${settings.lowStockThreshold} units or fewer`} />
      <Row
        label="Weekly buying budget"
        value={
          settings.weeklyPurchaseBudgetCents === null
            ? 'No limit'
            : formatMoney(settings.weeklyPurchaseBudgetCents)
        }
      />
      <Row
        label="Reorder policy"
        value={`${settings.reviewHorizonDays}d review · ${settings.safetyStockDays}d safety · ${settings.defaultSupplierLeadTimeDays}d default lead time`}
      />
      <Row
        label="Bundle pricing"
        value={`${settings.targetBundleMarginBp / 100}% margin · ${settings.defaultBundleDiscountBp / 100}% discount`}
      />
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

async function RateAction() {
  const rates = await listRates(1);
  return <RateSheet currentRate={rates[0]?.rateMicros ?? null} />;
}

async function SettingsAction() {
  const settings = await getSettings();
  return (
    <SettingsSheet
      initial={{
        businessName: settings?.businessName ?? 'Nextly',
        displayCurrency: settings?.displayCurrency ?? 'SRD',
        lowStockThreshold: settings?.lowStockThreshold ?? 5,
        quoteValidityDays: settings?.quoteValidityDays ?? 14,
        defaultPaymentDays: settings?.defaultPaymentDays ?? 14,
        weeklyPurchaseBudgetCents: settings?.weeklyPurchaseBudgetCents ?? null,
        reviewHorizonDays: settings?.reviewHorizonDays ?? 14,
        safetyStockDays: settings?.safetyStockDays ?? 7,
        defaultSupplierLeadTimeDays: settings?.defaultSupplierLeadTimeDays ?? 28,
        targetBundleMarginBp: settings?.targetBundleMarginBp ?? 3000,
        defaultBundleDiscountBp: settings?.defaultBundleDiscountBp ?? 500,
        legalName: settings?.legalName ?? '',
        addressLine: settings?.addressLine ?? '',
        city: settings?.city ?? '',
        phone: settings?.phone ?? '',
        whatsapp: settings?.whatsapp ?? '',
        email: settings?.email ?? '',
        taxId: settings?.taxId ?? '',
        logoUrl: settings?.logoUrl ?? '',
        invoiceFooter: settings?.invoiceFooter ?? '',
        instagram: settings?.instagram ?? '',
        openingHours: settings?.openingHours ?? '',
        pickupEnabled: settings?.pickupEnabled ?? false, pickupLabel: settings?.pickupLabel ?? '', pickupDetails: settings?.pickupDetails ?? '', sameDayPickupEnabled: settings?.sameDayPickupEnabled ?? false, pickupCutoffTime: settings?.pickupCutoffTime ?? '',
        deliveryEnabled: settings?.deliveryEnabled ?? false, deliveryDetails: settings?.deliveryDetails ?? '', deliveryAreas: settings?.deliveryAreas ?? '', deliveryFeeDisplay: settings?.deliveryFeeDisplay ?? '', deliveryEstimateDisplay: settings?.deliveryEstimateDisplay ?? '',
        paymentMethods: settings?.paymentMethods ?? [], announcement: settings?.announcement ?? '', heroTitle: settings?.heroTitle ?? '', heroBody: settings?.heroBody ?? '', supportTitle: settings?.supportTitle ?? '', supportBody: settings?.supportBody ?? '', defaultNewArrivalDays: settings?.defaultNewArrivalDays ?? 30,
      }}
    />
  );
}
