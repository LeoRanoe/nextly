import { notFound } from 'next/navigation';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { Badge, Dot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money, Numeric, Percent } from '@/components/ui/money';
import { Skeleton, SkeletonNumber } from '@/components/ui/skeleton';
import { Surface, SurfaceBody, SurfaceFooter, SurfaceHeader } from '@/components/ui/surface';
import { parseRate } from '@/lib/fx';
import { parseMoney } from '@/lib/money';

export const metadata = { title: 'Design system' };

/**
 * Living documentation for the Instrument design language.
 *
 * Not shipped to production. Its job is to make every token and primitive
 * visible in both themes at once, so a regression is obvious rather than
 * something you discover three screens deep.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const rate = parseRate('38.5');

  return (
    <div className="min-h-dvh bg-base">
      <header className="sticky top-0 z-10 border-line-subtle border-b bg-base/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="font-medium text-[15px] text-ink tracking-tight">Instrument</h1>
            <p className="text-[12px] text-ink-3">
              Nextly design language. Dense, technical, near-monochrome.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <Section
          title="Colour"
          note="Neutrals are tinted to hue 207, the hue of #125488. Nothing here is grey."
        >
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Swatches
              label="Surfaces"
              items={[
                ['bg-sunken', 'Sunken'],
                ['bg-base', 'Base'],
                ['bg-raised', 'Raised'],
                ['bg-inset', 'Inset'],
                ['bg-hover', 'Hover'],
              ]}
            />
            <Swatches
              label="Lines"
              items={[
                ['bg-line-subtle', 'Subtle'],
                ['bg-line', 'Default'],
                ['bg-line-strong', 'Strong'],
              ]}
            />
            <Swatches
              label="Semantic"
              items={[
                ['bg-accent', 'Accent'],
                ['bg-positive', 'Money in'],
                ['bg-negative', 'Money out'],
                ['bg-warning', 'Warning'],
                ['bg-info', 'Info'],
              ]}
            />
          </div>

          <div className="mt-6">
            <p className="mb-2 text-[12px] text-ink-3">
              The brand palette is reserved for data visualisation. It never appears in chrome.
            </p>
            <div className="flex h-12 overflow-hidden rounded-card border border-line-subtle">
              {['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'].map(
                (tone) => (
                  <div key={tone} className={`flex-1 ${tone}`} />
                ),
              )}
            </div>
          </div>
        </Section>

        <Section
          title="Typography"
          note="Instrument Sans for interface text. JetBrains Mono, tabular, for every number."
        >
          <div className="space-y-3">
            <p className="text-[30px] text-ink leading-none tracking-[-0.03em]">
              Wyze Cam Pan V3
            </p>
            <p className="text-[15px] text-ink">Purchase order PO-001 received</p>
            <p className="text-[13px] text-ink-2">
              Five units landed at 29.548 each after shipping, tax and card fees.
            </p>
            <p className="text-[12px] text-ink-3">Supporting detail and table captions</p>
            <p className="text-[11px] text-ink-4 uppercase tracking-[0.08em]">Section label</p>
          </div>

          <div className="mt-6 rounded-card border border-line-subtle bg-inset p-4">
            <p className="mb-2 text-[12px] text-ink-3">
              Alignment test. These must line up on the decimal.
            </p>
            <div className="flex flex-col items-end gap-0.5">
              {[
                parseMoney('9.05'),
                parseMoney('147.74'),
                parseMoney('1234.50'),
                parseMoney('29.55'),
              ].map((cents) => (
                <Money key={cents} cents={cents} size="lg" />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Money" note="One component, one voice, everywhere.">
          <div className="flex flex-wrap items-start gap-8">
            <Field label="Display">
              <Money cents={parseMoney('350.00')} size="display" />
            </Field>
            <Field label="With SRD">
              <Money cents={parseMoney('101.81')} size="xl" srdRate={rate} />
            </Field>
            <Field label="Money in">
              <Money cents={parseMoney('294.75')} tone="flow" size="lg" signed />
            </Field>
            <Field label="Money out">
              <Money cents={parseMoney('-147.74')} tone="flow" size="lg" />
            </Field>
            <Field label="Margin">
              <Percent value={0.4628} />
            </Field>
            <Field label="Reference">
              <Numeric className="text-ink-2">NX-WYZE-PANV3-BLK</Numeric>
            </Field>
          </div>
        </Section>

        <Section title="Controls">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Record sale</Button>
            <Button variant="secondary">Receive order</Button>
            <Button variant="outline">Export</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Void</Button>
            <Button variant="link">View purchase order</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Draft</Badge>
            <Badge tone="info">
              <Dot /> Ordered
            </Badge>
            <Badge tone="accent">
              <Dot /> Shipped
            </Badge>
            <Badge tone="positive">
              <Dot /> Received
            </Badge>
            <Badge tone="warning">
              <Dot /> Low stock
            </Badge>
            <Badge tone="negative">
              <Dot /> Cancelled
            </Badge>
          </div>
        </Section>

        <Section title="Panels">
          <div className="grid gap-4 sm:grid-cols-2">
            <Surface>
              <SurfaceHeader
                title="Inventory at cost"
                hint="Weighted average, landed"
                action={
                  <Button size="sm" variant="ghost">
                    View
                  </Button>
                }
              />
              <SurfaceBody>
                <Money cents={parseMoney('29.55')} size="display" srdRate={rate} />
              </SurfaceBody>
              <SurfaceFooter>
                <span>1 unit on hand</span>
                <span className="tabular">NX-WYZE-PANV3-BLK</span>
              </SurfaceFooter>
            </Surface>

            <Surface>
              <SurfaceHeader title="Loading state" hint="Geometry matches the real thing" />
              <SurfaceBody className="space-y-2">
                <SkeletonNumber chars={10} className="h-7" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </SurfaceBody>
              <SurfaceFooter>
                <Skeleton className="h-3 w-20" />
              </SurfaceFooter>
            </Surface>
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 border-line-subtle border-b pb-2">
        <h2 className="font-medium text-[11px] text-ink-3 uppercase tracking-[0.08em]">
          {title}
        </h2>
        {note ? <p className="mt-1 text-[12px] text-ink-4">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {children}
      <span className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">{label}</span>
    </div>
  );
}

function Swatches({ label, items }: { label: string; items: [string, string][] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] text-ink-4 uppercase tracking-[0.06em]">{label}</p>
      <div className="overflow-hidden rounded-card border border-line-subtle">
        {items.map(([tone, name]) => (
          <div
            key={tone}
            className="flex items-center gap-3 border-line-subtle border-b px-3 py-2 last:border-b-0"
          >
            <span className={`size-5 shrink-0 rounded-row border border-line-subtle ${tone}`} />
            <span className="text-[12px] text-ink-2">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
