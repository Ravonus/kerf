-- Sample goods, so a new shop has something on its shelves: psql "$DATABASE_URL" -f seed.sql
insert into categories (slug, name)
select lower(n), n from unnest(array['Kitchen', 'Garden', 'Office', 'Outdoor', 'Audio', 'Lighting', 'Travel', 'Bath']) as n
on conflict do nothing;

insert into products (slug, name, description, category_id, price_cents, stock, featured)
select 'product-' || g,
  (array['Oak', 'Linen', 'Copper', 'Slate', 'Walnut', 'Cedar', 'Ceramic', 'Brass'])[1 + (g % 8)] || ' ' ||
  (array['Lamp', 'Stool', 'Kettle', 'Shelf', 'Basket', 'Speaker', 'Tray', 'Planter', 'Satchel', 'Mug'])[1 + (g % 10)] || ' ' || g,
  'A dependable piece, made to be used every day and repaired when it wears.',
  (select id from categories order by id offset g % 8 limit 1), 500 + (g * 7919) % 49500, (g * 31) % 40, g % 20 = 0
from generate_series(1, 400) g
on conflict do nothing;
