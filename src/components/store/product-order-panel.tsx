'use client';

import { useState } from 'react';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { fromBase } from '@/lib/fx';
import { formatMoney } from '@/lib/money';

type Variant = { id: string; name: string; sku: string; listPriceCents: number; onHand: number };

/** Variant selection is intentionally local UI state; price and availability
 * remain from the server's public catalog read model. */
export function ProductOrderPanel({ productName, variants, srdRate, whatsapp }: { productName: string; variants: Variant[]; srdRate?: number; whatsapp: string | null | undefined }) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  if (!variant) return null;
  const inStock = variant.onHand > 0;
  const price = srdRate && srdRate > 0 ? `${formatMoney(fromBase(variant.listPriceCents, srdRate), 'SRD', { bare: true })} SRD` : formatMoney(variant.listPriceCents, 'USD');
  return <><StorePrice usdCents={variant.listPriceCents} srdRate={srdRate} size="xl" /><div className="mt-3 flex flex-wrap gap-2">{variants.map((item) => <button key={item.id} type="button" onClick={() => setVariantId(item.id)} className={`rounded-control border px-3 py-1.5 text-[12px] ${item.id === variant.id ? 'border-accent bg-accent-muted text-ink' : 'border-line text-ink-3'}`}>{item.name}</button>)}</div><div className="mt-4"><WhatsAppCta number={whatsapp} message={`Hi Nextly, I’d like to ${inStock ? 'order' : 'ask about restocking'} the ${productName} – ${variant.name}${variant.sku ? ` (SKU ${variant.sku})` : ''}. I saw it listed for ${price}${inStock ? ' and currently in stock' : ''}.`} label={inStock ? 'Order on WhatsApp' : 'Ask about restock'} className="h-11 rounded-full px-6 text-[14px]" /></div></>;
}
