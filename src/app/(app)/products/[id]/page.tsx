import { ExternalLink } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ProductForm } from '@/components/forms/product-form';
import { ProductImages } from '@/components/forms/product-images';
import { ProductRelationships } from '@/components/forms/product-relationships';
import { ProductStorefrontCollections } from '@/components/forms/product-storefront-collections';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MobileList, MobileRow, MobileRowHeader } from '@/components/ui/mobile-list';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { toDecimalString } from '@/lib/money';
import type { WarrantyState } from '@/lib/warranty';
import { listBrandOptions, listCategoryOptions, listSupplierOptions } from '@/server/queries/pickers';
import { getProduct, listProductRelationshipOptions, listProductRelationships } from '@/server/queries/reference';
import { listProductWarrantyItems } from '@/server/queries/warranty';
import { listProductStorefrontCollections, listStorefrontCollectionOptions } from '@/server/queries/storefront';

export const metadata: Metadata = { title: 'Product' };

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <PageHeader
        title="Product"
        description="Stock and cost are never edited here. They are the consequence of purchase orders and sales."
        action={
          <Button asChild variant="ghost">
            <Link href="/products">Back</Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <Loader params={params} />
      </Suspense>
    </>
  );
}

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, suppliers, brands] = await Promise.all([
    getProduct(id),
    listCategoryOptions(),
    listSupplierOptions(),
    listBrandOptions(),
  ]);

  if (!product) notFound();
  const [relationships, relationshipOptions, collectionMemberships, collectionOptions] = await Promise.all([listProductRelationships(id), listProductRelationshipOptions(id), listProductStorefrontCollections(id), listStorefrontCollectionOptions()]);

  // The warranty months comes from the product itself, so this has to wait
  // for it — passing the loaded value keeps the section below from disagreeing
  // with the form above if the row was edited since.
  const warrantyItems = await listProductWarrantyItems(id, product.warrantyMonths);

  return (
    <div className="space-y-4">
      {product.catalogPublished ? (
        <div className="flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/p/${product.slug}` as Route} target="_blank">
              <ExternalLink className="size-3.5" /> View in catalog
            </Link>
          </Button>
        </div>
      ) : null}
      <ProductImages productId={product.id} initial={product.images} />
      <ProductRelationships productId={product.id} relationships={relationships} options={relationshipOptions} />
      <ProductStorefrontCollections productId={product.id} memberships={collectionMemberships} collections={collectionOptions} />
      <ProductForm
        categories={categories}
        suppliers={suppliers}
        brands={brands}
        initial={{
          id: product.id,
          code: product.code,
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          supplierId: product.supplierId,
          brandId: product.brandId,
          sourceUrl: product.sourceUrl ?? '',
          summary: product.summary ?? '',
          description: product.description ?? '',
          specs: Object.entries(product.specs).map(([key, value]) => ({ key, value })),
          modelNumber: product.modelNumber ?? '',
          keyFeatures: product.keyFeatures.join('\n'),
          bestFor: product.bestFor.join('\n'),
          platforms: product.compatibility.platforms.join('\n'),
          protocols: product.compatibility.protocols.join('\n'),
          ecosystems: product.compatibility.ecosystems.join('\n'),
          boxContents: product.boxContents.join('\n'),
          nextlyTake: product.nextlyTake ?? '',
          hubRequired: product.buyerRequirements.hubRequired ?? false, hubName: product.buyerRequirements.hubName ?? '', appRequired: product.buyerRequirements.appRequired ?? false, appName: product.buyerRequirements.appName ?? '', wifiRequired: product.buyerRequirements.wifiRequired ?? false, wifiBands: product.buyerRequirements.wifiBands.join('\n'), indoorOutdoor: product.buyerRequirements.indoorOutdoor ?? '', powerSource: product.buyerRequirements.powerSource ?? '', installationNotes: product.buyerRequirements.installationNotes ?? '', faqItems: product.faqItems,
          featured: product.featured,
          featuredPosition: product.featuredPosition == null ? '' : String(product.featuredPosition), newUntil: product.newUntil?.slice(0, 10) ?? '',
          showWhenOutOfStock: product.showWhenOutOfStock,
          restockNotificationsEnabled: product.restockNotificationsEnabled,
          status: product.status,
          warrantyMonths: String(product.warrantyMonths),
          catalogPublished: product.catalogPublished,
          notes: product.notes ?? '',
          variants: product.variants.map((variant) => ({
            key: variant.id,
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            listPrice: toDecimalString(variant.listPriceCents),
            referenceCost: toDecimalString(variant.referenceCostCents),
            weightGrams: String(variant.weightGrams),
            isStrategic: variant.isStrategic,
            isDefault: variant.isDefault,
            isActive: variant.isActive,
            barcode: variant.barcode ?? '',
            attributes: Object.entries(variant.attributes).map(([key, value]) => ({ key, value })),
          })),
        }}
      />
      <WarrantySection items={warrantyItems} />
    </div>
  );
}

const WARRANTY_TONE: Record<WarrantyState, 'positive' | 'warning' | 'negative' | 'neutral'> = {
  covered: 'positive',
  expiring: 'warning',
  expired: 'negative',
  none: 'neutral',
};

/** Units of this product that went out with a serial (F-6). Empty when none
 *  ever did — most products never need one, so the section stays quiet. */
function WarrantySection({
  items,
}: {
  items: Awaited<ReturnType<typeof listProductWarrantyItems>>;
}) {
  if (items.length === 0) return null;

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader
        title="Serial numbers"
        hint={`${items.length} sold with a serial · warranty counts from the day of sale`}
      />
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Serial</TH>
                <TH>Variant</TH>
                <TH>Sold</TH>
                <TH>Customer</TH>
                <TH>Expires</TH>
                <TH numeric>Status</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={`${item.saleId}-${item.serial}`}>
                  <TD className="tabular whitespace-nowrap text-ink">{item.serial}</TD>
                  <TD className="text-[12px] whitespace-nowrap text-ink-3">
                    {item.variantName} · {item.sku}
                  </TD>
                  <TD className="text-[12px] whitespace-nowrap">
                    <Link
                      href={`/sales/${item.saleId}` as Route}
                      className="text-ink-2 hover:text-accent hover:underline"
                    >
                      {formatDate(item.soldAt)} · {item.saleNumber}
                    </Link>
                  </TD>
                  <TD className="truncate text-[12px] text-ink-2">
                    {item.customerName ?? 'Walk-in'}
                  </TD>
                  <TD className="text-[12px] whitespace-nowrap text-ink-3 tabular">
                    {item.expiresAt ? formatDate(item.expiresAt) : '—'}
                  </TD>
                  <TD numeric>
                    <Badge tone={WARRANTY_TONE[item.state]}>
                      {item.state === 'none'
                        ? 'No warranty'
                        : item.state === 'expiring'
                          ? 'Expiring soon'
                          : item.state}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </div>
      <MobileList>
        {items.map((item) => (
          <MobileRow key={`${item.saleId}-${item.serial}`} interactive={false}>
            <MobileRowHeader>
              <span className="min-w-0">
                <span className="tabular block truncate text-[13px] text-ink">
                  {item.serial}
                </span>
                <span className="block truncate text-[11px] text-ink-4">
                  {item.variantName} · {item.sku}
                </span>
              </span>
              <Badge tone={WARRANTY_TONE[item.state]} className="shrink-0">
                {item.state === 'none'
                  ? 'No warranty'
                  : item.state === 'expiring'
                    ? 'Expiring soon'
                    : item.state}
              </Badge>
            </MobileRowHeader>
            <p className="mt-1 text-[11px] text-ink-4">
              <Link
                href={`/sales/${item.saleId}` as Route}
                className="hover:text-accent hover:underline"
              >
                {formatDate(item.soldAt)} · {item.saleNumber}
              </Link>
              {' · '}
              {item.customerName ?? 'Walk-in'}
              {' · '}
              {item.expiresAt ? `expires ${formatDate(item.expiresAt)}` : 'no warranty'}
            </p>
          </MobileRow>
        ))}
      </MobileList>
    </Surface>
  );
}
