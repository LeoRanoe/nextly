# Storefront merchandising

Storefront content extends `products`, `product_variants`, inventory movements and purchase orders; it never creates a customer-facing product copy. Public queries in `src/server/queries/catalog.ts` select only catalog fields, prices, media and stock units. Costs, supplier data, valuation and margins remain private.

`brands` identifies the manufacturer, separately from the supplier. Product compatibility uses JSON arrays for platforms, protocols and ecosystems; buyer requirements, box contents, key features and FAQ entries are structured product fields. `product_relationships` is directional and rejects self-references. `storefront_collections` is for customer intent, not a replacement for categories.

Restock requests are historical demand records. They are only accepted for published products that explicitly enable them, and receiving stock never automatically messages a customer. Incoming availability must be calculated from outstanding purchase-order item quantities and expected dates; it must not be copied onto a product.

Catalog readiness is computed from the current product state. Missing name, valid slug, image or sellable active variant are blockers; incomplete enrichment is a warning.
