-- P0-10 · Storefront conversion path.
--
-- The public catalog had no way to buy and no way to reach the shop: the only
-- identity on the site was a single "Nextly · Paramaribo" line. A real footer
-- needs an address, opening hours, phone, WhatsApp and Instagram — the last
-- two of which the business never had anywhere to store.
--
-- Nullable free text, matching the rest of the identity columns: the footer
-- renders whatever is filled in and omits the rest, so nothing breaks before
-- the owner has typed it into Settings.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS instagram      text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS opening_hours  text;
