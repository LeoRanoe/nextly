# Storefront merchandising

Storefront content extends `products`, `product_variants`, inventory movements and purchase orders; it never creates a customer-facing product copy. Public queries in `src/server/queries/catalog.ts` select only catalog fields, prices, media and stock units. Costs, supplier data, valuation and margins remain private.

`brands` identifies the manufacturer, separately from the supplier. Product compatibility uses JSON arrays for platforms, protocols and ecosystems; buyer requirements, box contents, key features and FAQ entries are structured product fields. `product_relationships` is directional and rejects self-references. `storefront_collections` is for customer intent, not a replacement for categories.

Restock requests are historical demand records. They are only accepted for published products that explicitly enable them, and receiving stock never automatically messages a customer. Incoming availability must be calculated from outstanding purchase-order item quantities and expected dates; it must not be copied onto a product.

Catalog readiness is computed from the current product state. Missing name, valid slug, image or sellable active variant are blockers; incomplete enrichment is a warning.

## Dashboard workflow

The product editor remains the only place to change catalog product data. Its variants carry SKU, barcode, price, reference cost, weight, structured attributes, active state, strategic state and one active default option. Selecting a storefront variant changes only the customer-facing display and WhatsApp request; inventory and accounting remain on the same variant record.

Use related products for explicit accessory, required-accessory and alternative guidance. Use storefront collections for customer goals such as “Protect your home,” not as a substitute for categories. Product collection membership and relationships are audited dashboard actions.

Pickup, delivery, payment display, hero/support copy and the new-arrival window belong in the existing Settings record. Public pages display only configured operational text. A product warranty is shown only when its existing warranty-month value is greater than zero.
