-- Fixed homepage sections are settings, not a generic page builder. Defaults
-- preserve the current storefront behaviour for every existing installation.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS homepage_available_now_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS homepage_available_now_limit integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS homepage_featured_bundles_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS homepage_featured_bundles_limit integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS homepage_just_arrived_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS homepage_just_arrived_limit integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS homepage_coming_next_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS homepage_coming_next_limit integer NOT NULL DEFAULT 4;

ALTER TABLE settings
  ADD CONSTRAINT settings_homepage_available_now_limit_check CHECK (homepage_available_now_limit BETWEEN 1 AND 24),
  ADD CONSTRAINT settings_homepage_featured_bundles_limit_check CHECK (homepage_featured_bundles_limit BETWEEN 1 AND 24),
  ADD CONSTRAINT settings_homepage_just_arrived_limit_check CHECK (homepage_just_arrived_limit BETWEEN 1 AND 24),
  ADD CONSTRAINT settings_homepage_coming_next_limit_check CHECK (homepage_coming_next_limit BETWEEN 1 AND 24);
