begin;

-- English names matched to the supplier document supplied by the owner.
-- Supplier LF0002/LB0091/L0121/LCP0025 correspond to POS LF-02/LB-91/L-121/LCP-25.
-- Chinese names, prices, stock and historical sale descriptions remain unchanged.
do $$begin
  if not exists (
    select 1 from public.businesses
    where id = '10000000-0000-0000-0000-000000000001'
      and name = 'CHIPSTI ENTERPRISE'
      and ssm = '202603232290 (RA0139100-V)'
  ) then
    raise exception 'STOP: Apply this file only to the CHIPSTI POS database.';
  end if;
end$$;

with names(sku, english_name) as (values
  ('LF-02', 'Original Golden Arrowhead'),
  ('LF-05', 'Salted Egg Arrowhead'),
  ('LF-08', 'Kam Heong Salted Egg Fish Skin'),
  ('LF-11', 'Salted Egg Truffle Fish Skin'),
  ('LF-21', 'Salted Egg Dodo Crab Sticks'),
  ('LB-91', 'Farmcow Pineapple Balls'),
  ('L-28', 'Black Sesame Honeycomb'),
  ('L-36', 'Kam Heong Chicken Floss Egg Rolls'),
  ('L-121', 'Mexico Chocolate Cream Kapet'),
  ('L-146', 'Gold Tin Traditional Seaweed Chicken Floss Wallet Puffs'),
  ('LCP-25', 'Pure Belgian Sea Salt Chocolate')
)
update public.products p
set english_name = n.english_name
from names n
where p.sku = n.sku
returning p.sku, p.name, p.english_name;

commit;
