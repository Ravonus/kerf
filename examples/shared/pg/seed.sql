-- Deterministic: setseed before each table, so row contents never depend on insertion order elsewhere.
select setseed(0.1);
insert into categories (slug, name)
select lower(n), n from unnest(array['Kitchen','Garden','Office','Outdoor','Audio','Lighting','Travel','Bath']) as n;

select setseed(0.2);
insert into products (slug, name, description, category_id, price_cents, stock, featured)
select 'product-' || g,
  (array['Oak','Linen','Copper','Slate','Walnut','Cedar','Ceramic','Brass'])[1 + (g % 8)] || ' ' ||
  (array['Lamp','Stool','Kettle','Shelf','Basket','Speaker','Tray','Planter','Satchel','Mug'])[1 + (g % 10)] || ' ' || g,
  'A dependable piece, made to be used every day and repaired when it wears. Item ' || g || '.',
  1 + (g % 8), 500 + floor(random() * 49500)::int, floor(random() * 40)::int, g % 400 = 0
from generate_series(1, 5000) g;

select setseed(0.3);
insert into customers (name, email, city)
select (array['Ada','Grace','Linus','Margaret','Alan','Katherine','Edsger','Barbara'])[1 + (g % 8)] || ' ' ||
  (array['Reed','Okafor','Silva','Nakamura','Novak','Haddad','Larsen','Kaur','Moreau','Ivanov'])[1 + (g % 10)],
  'customer' || g || '@example.com',
  (array['Lisbon','Osaka','Nairobi','Denver','Tallinn','Bogota'])[1 + (g % 6)]
from generate_series(1, 2000) g;

select setseed(0.4);
insert into orders (customer_id, status, total_cents, created_at)
select 1 + (g % 2000), (array['paid','paid','paid','shipped','shipped','pending','refunded'])[1 + floor(random() * 7)::int],
  0, timestamptz '2026-10-01 00:00:00+00' - (g * interval '37 minutes')
from generate_series(1, 10000) g;

select setseed(0.5);
insert into order_items (order_id, product_id, quantity, price_cents)
select o.id, p.id, p.quantity, p.price_cents
from orders o cross join lateral (
  select 1 + ((o.id * 7 + n * 131) % 5000) as id, 1 + ((o.id + n) % 3) as quantity, n from generate_series(1, 1 + o.id % 4) n
) l(id, quantity, n)
join products p0 on p0.id = l.id
cross join lateral (select p0.id, l.quantity, p0.price_cents) p;

update orders o set total_cents = t.sum from (select order_id, sum(quantity * price_cents) as sum from order_items group by 1) t where t.order_id = o.id;

-- The account every variant signs in as (see the bench user in docs/research/40-site-benchmarks.md), and one whose rows it must
-- never see. The password is Better Auth 1.7's hashPassword of the one in bench-user.json, a throwaway local test credential.
insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
values ('bench-user', 'Bench User', 'bench@kerf.dev', true, '2026-10-01 00:00:00+00', '2026-10-01 00:00:00+00'),
  ('other-user', 'Other User', 'other@kerf.dev', true, '2026-10-01 00:00:00+00', '2026-10-01 00:00:00+00');
insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
select 'account-' || id, id, 'credential', id,
  '10af2cf97b4dd3bd218a818f8eb1accd:fd8f2b3b8b10e2595ce80daf16ef1bc67972a8956628cd6d2e30c363f99b84c73414c78589012bfcbd59f34ef2c5f85683d1dac27f3ba366cfd5d37c2c44fe63',
  '2026-10-01 00:00:00+00', '2026-10-01 00:00:00+00'
from "user";

insert into todos (id, user_id, title, done, created_at)
select md5('todo-' || g)::uuid, 'bench-user', 'Seeded todo ' || g, g % 3 = 0, timestamptz '2026-10-01 00:00:00+00' + (g * interval '1 minute')
from generate_series(1, 200) g;
insert into todos (id, user_id, title, done, created_at)
select md5('other-' || g)::uuid, 'other-user', 'Other user todo ' || g, false, timestamptz '2026-10-01 00:00:00+00' + (g * interval '1 minute')
from generate_series(1, 3) g;
analyze;
