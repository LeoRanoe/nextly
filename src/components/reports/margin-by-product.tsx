import type { Route } from 'next';
import Link from 'next/link';
import { Money, Percent } from '@/components/ui/money';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, THSort, TR } from '@/components/ui/table';
import { type PeriodPreset, periodRange } from '@/lib/report-period';
import { listProductMargins, type ProductMarginSort } from '@/server/queries/reports';

export async function MarginByProduct({
  sort,
  period,
}: {
  sort: ProductMarginSort;
  /** The report page's period preset. This table now honours it — P1-2. */
  period: PeriodPreset;
}) {
  const rows = await listProductMargins(sort, periodRange(period));

  const sortHref = (target: ProductMarginSort): Route =>
    `/reports?period=${period}&marginSort=${target}` as Route;

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader
        title="Margin by product"
        hint={
          period === 'all'
            ? 'All time, net of returns'
            : 'Within the selected period, net of returns'
        }
      />
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-ink-4">
          No confirmed sales in this period.
        </p>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Product</TH>
                <THSort href={sortHref('units')} active={sort === 'units'} dir="desc" numeric>
                  Units
                </THSort>
                <THSort
                  href={sortHref('revenue')}
                  active={sort === 'revenue'}
                  dir="desc"
                  numeric
                >
                  Revenue
                </THSort>
                <TH numeric>Cost</TH>
                <THSort href={sortHref('gross')} active={sort === 'gross'} dir="desc" numeric>
                  Gross
                </THSort>
                <TH numeric>Margin</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.productId}>
                  <TD className="whitespace-nowrap text-ink">
                    <Link
                      href={`/products/${row.productId}` as Route}
                      className="hover:text-accent hover:underline"
                    >
                      {row.name}
                    </Link>
                    <span className="tabular ml-2 text-[11px] text-ink-4">{row.code}</span>
                  </TD>
                  <TD numeric className="text-ink-3">
                    {row.unitsSold}
                  </TD>
                  <TD numeric>
                    <Money cents={row.revenueCents} size="sm" />
                  </TD>
                  <TD numeric>
                    <Money cents={row.cogsCents} size="sm" tone="muted" />
                  </TD>
                  <TD numeric>
                    <Money cents={row.grossCents} size="sm" tone="flow" />
                  </TD>
                  <TD numeric>
                    <Percent value={row.marginRate} tone="flow" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </Surface>
  );
}
