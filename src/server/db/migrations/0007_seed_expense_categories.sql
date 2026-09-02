INSERT INTO expense_categories (name, slug, position) VALUES
  ('Shipping & freight', 'shipping-freight', 1),
  ('Marketing & ads', 'marketing-ads', 2),
  ('Software & tools', 'software-tools', 3),
  ('Transport & fuel', 'transport-fuel', 4),
  ('Packaging', 'packaging', 5),
  ('Bank & card fees', 'bank-card-fees', 6),
  ('Rent & utilities', 'rent-utilities', 7),
  ('Other', 'other', 99)
ON CONFLICT (slug) DO NOTHING;