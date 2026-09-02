-- F-3 · Invoice / receipt.
--
-- An invoice has to say who issued it. Until now `settings` held only a name,
-- a currency and a stock threshold, so the only place the address and phone
-- number lived was inside whoever typed them into a sale's notes. Business
-- identity belongs on the document, which means it belongs in settings — not
-- hard-coded into a template that drifts the moment the shop moves street.
--
-- All nullable text: an invoice renders whatever is filled in and omits the
-- rest. The logo is a URL because uploads already resolve to public blob
-- URLs (see the product-image path); storing bytes here would duplicate what
-- storage is for.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS legal_name        text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS address_line      text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS city              text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone             text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp          text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS email             text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tax_id            text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS logo_url          text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS invoice_footer    text;
