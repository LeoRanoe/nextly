import type { Route } from 'next';
import Link from 'next/link';
import { Money } from '@/components/ui/money';
import type { ImportPipelineData } from '@/server/queries/overview';

export function ImportPipeline({ data }: { data: ImportPipelineData }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-line-subtle sm:grid-cols-4">
      <Metric
        label="Open orders"
        value={data.openOrders}
        href="/purchase-orders?status=ordered"
      />
      <Metric
        label="In transit"
        value={data.inboundOrders}
        href="/purchase-orders?status=shipped"
      />
      <Metric
        label="Received · unpaid"
        value={data.receivedUnpaid}
        href="/purchase-orders?status=received"
      />
      <div className="px-4 py-3">
        <p className="text-[11px] text-ink-4">Committed</p>
        <Money cents={data.committedUsdCents} size="sm" />
      </div>
    </div>
  );
}

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href as Route} className="px-4 py-3 transition-colors hover:bg-inset">
      <p className="text-[11px] text-ink-4">{label}</p>
      <p className="tabular mt-1 text-[18px] font-semibold text-ink">{value}</p>
    </Link>
  );
}
