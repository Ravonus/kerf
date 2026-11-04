import { test } from 'node:test'
import { assert, eventually, see, site } from '../lib/e2e-kit.mjs'

/** Product links on the page, one per product: a card may link its image and its title. */
const products = (page) =>
  page
    .getByRole('link')
    .evaluateAll((a) => [
      ...new Set(a.map((x) => new URL(x.href).pathname).filter((p) => p.startsWith('/p/'))),
    ])
const cart = (page) => page.getByRole('link', { name: /^Cart \(\d+\)$/ })

test('/ shows the categories and 12 featured products', async () => {
  const page = await site.open()
  await site.go(page, '/')
  for (const c of ['Kitchen', 'Garden', 'Office'])
    await see(page.getByRole('link', { name: c, exact: true }))
  assert.equal((await products(page)).length, 12)
})

test('a category is 24 products a page, and page is in the URL', async () => {
  const page = await site.open()
  await site.go(page, '/c/kitchen')
  const one = await products(page)
  assert.equal(one.length, 24)
  await site.go(page, '/c/kitchen?page=2')
  const two = await products(page)
  assert.equal(two.length, 24)
  assert.equal(one.filter((p) => two.includes(p)).length, 0)
})

test('min and max narrow the list, from the URL', async () => {
  const page = await site.open()
  await site.go(page, '/c/kitchen?min=999999999')
  assert.equal((await products(page)).length, 0)
})

test('stock leaves out what is out of stock', async () => {
  const page = await site.open()
  await site.go(page, '/c/kitchen?stock=1')
  const slugs = (await products(page)).map((p) => `'${p.slice(3)}'`).join(',')
  assert.ok(slugs)
  assert.equal(
    await site.sql(`select count(*) from products where slug in (${slugs}) and stock = 0`),
    '0',
  )
})

test('a product shows its details and 4 related', async () => {
  const page = await site.open()
  await site.go(page, '/p/product-1')
  await see(page.getByText(await site.sql(`select name from products where slug = 'product-1'`)))
  await see(page.getByRole('button', { name: 'Add to cart', exact: true }))
  assert.equal((await products(page)).filter((p) => p !== '/p/product-1').length, 4)
})

for (const path of ['/p/no-such-product', '/c/no-such-category']) {
  test(`${path} answers 404`, async () => {
    const page = await site.open()
    assert.equal((await site.go(page, path)).status(), 404)
  })
}

test('Add to cart moves the header count, and a reload keeps it', async () => {
  const page = await site.open()
  await site.go(page, '/p/product-1')
  await see(page.getByRole('link', { name: 'Cart (0)', exact: true }))
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await see(page.getByRole('link', { name: 'Cart (1)', exact: true }))
  await site.go(page, '/p/product-1')
  await see(page.getByRole('link', { name: 'Cart (1)', exact: true }))
})

test("another visitor's cart isn't visible", async () => {
  const page = await site.open()
  await site.go(page, '/p/product-1')
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await see(page.getByRole('link', { name: 'Cart (1)', exact: true }))
  const other = await site.open()
  await site.go(other, '/p/product-1')
  await see(other.getByRole('link', { name: 'Cart (0)', exact: true }))
})

test('the cart is behind Suspense: the page is usable before it lands', async () => {
  const page = await site.open()
  await site.go(page, '/')
  await eventually(async () => assert.equal(await cart(page).count(), 1))
})

// The same site in every stack, not only the contract's roles: one brand, one copy, one set of rows, one set of cart rules.

test('every variant is the same shop', async () => {
  const page = await site.open()
  await site.go(page, '/')
  assert.equal(await page.title(), 'Goods made to be mended · Mendwell')
  await see(page.getByRole('link', { name: 'Mendwell', exact: true }))
  await see(page.getByRole('heading', { level: 1, name: 'Buy it once. Mend it forever.' }))
  for (const h of ['Aisles', 'On the front table'])
    await see(page.getByRole('heading', { level: 2, name: h, exact: true }))
  for (const h of ['Screws, not glue', 'Parts on the shelf', 'Repairs by post'])
    await see(page.getByRole('heading', { level: 3, name: h, exact: true }))
  await see(page.getByText('Mendwell. Goods made to be used hard and fixed when they wear.'))
  await see(page.getByRole('navigation', { name: 'Aisles' }))
})

test('/ shows the first 12 featured products by id', async () => {
  const page = await site.open()
  await site.go(page, '/')
  const want = await site.rows(
    `select '/p/' || slug as path from products where featured order by id limit 12`,
  )
  assert.deepEqual(
    await products(page),
    want.map((r) => r.path),
  )
})

test('a category lists the aisles, marks its own, and sorts by price then id', async () => {
  const page = await site.open()
  await site.go(page, '/c/kitchen')
  const aisles = page.getByRole('navigation', { name: 'Aisles' })
  assert.equal(
    await aisles.getByRole('link').count(),
    Number(await site.sql('select count(*) from categories')),
  )
  assert.equal(
    await aisles.locator('[aria-current=page]').innerText(),
    await site.sql(`select name from categories where slug = 'kitchen'`),
  )
  await see(
    page.getByRole('heading', {
      level: 1,
      name: await site.sql(`select name from categories where slug = 'kitchen'`),
    }),
  )
  const want = await site.rows(
    `select '/p/' || p.slug as path from products p join categories c on c.id = p.category_id where c.slug = 'kitchen' order by p.price_cents, p.id limit 24`,
  )
  assert.deepEqual(
    await products(page),
    want.map((r) => r.path),
  )
  const total = await site.sql(
    `select count(*) from products p join categories c on c.id = p.category_id where c.slug = 'kitchen'`,
  )
  await see(page.getByText(`${Number(total).toLocaleString('en-US')} pieces, lowest price first`))
  await see(page.getByText(`Page 1 of ${Math.ceil(total / 24)}`))
})

test('prices filter in whole dollars, and past any price is an empty page, not an error', async () => {
  const page = await site.open()
  await site.go(page, '/c/kitchen?min=20&max=40')
  const inRange = await site.sql(
    `select count(*) from products p join categories c on c.id = p.category_id where c.slug = 'kitchen' and p.price_cents between 2000 and 4000`,
  )
  await see(
    page.getByText(
      new RegExp(`^${Number(inRange).toLocaleString('en-US')} pieces?, lowest price first$`),
    ),
  )
  for (const min of ['999999999', '99999999999999']) {
    const r = await site.go(page, `/c/kitchen?min=${min}`)
    assert.equal(r.status(), 200)
    await see(page.getByRole('heading', { name: 'Nothing fits those filters' }))
  }
})

test('nonsense in the URL falls back to the first page', async () => {
  const page = await site.open()
  const first = await (async () => {
    await site.go(page, '/c/kitchen')
    return products(page)
  })()
  for (const q of ['page=abc', 'page=-3', 'page=1e300', 'min=abc', 'max=-1']) {
    assert.equal((await site.go(page, `/c/kitchen?${q}`)).status(), 200, q)
    assert.deepEqual(await products(page), first, q)
  }
})

test('the filter form works, the checkbox on its own', async () => {
  const page = await site.open()
  await site.go(page, '/c/kitchen?page=2')
  await page.getByText('In stock only').click()
  await eventually(() => {
    assert.equal(site.query(page, 'stock'), '1')
    assert.equal(site.query(page, 'page'), null)
  })
  await page.getByRole('spinbutton', { name: 'Min price' }).fill('20')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await eventually(() => assert.equal(site.query(page, 'min'), '20'))
})

test('related is the 4 lowest ids in the aisle, sold out or not', async () => {
  const id = await site.sql(
    `select id from products where category_id = (select category_id from products where slug = 'product-1') and slug <> 'product-1' order by id limit 1`,
  )
  await site.sql(`update products set stock = 0 where id = ${id}`)
  const page = await site.open()
  await site.go(page, '/p/product-1')
  const want = await site.rows(
    `select '/p/' || slug as path from products where category_id = (select category_id from products where slug = 'product-1') and slug <> 'product-1' order by id limit 4`,
  )
  assert.deepEqual(
    (await products(page)).filter((p) => p !== '/p/product-1'),
    want.map((r) => r.path),
  )
  await see(page.getByRole('heading', { name: 'From the same aisle', exact: true }))
  await see(page.getByText('Sold out'))
})

test('a product says how much is left, and a sold out one keeps a disabled button', async () => {
  await site.sql(
    `update products set stock = 3 where slug = 'product-1'; update products set stock = 0 where slug = 'product-2'`,
  )
  const page = await site.open()
  await site.go(page, '/p/product-1')
  await see(page.getByText('Only 3 left.'))
  await site.go(page, '/p/product-2')
  await see(page.getByText('Back when the workshop catches up.'))
  assert.equal(
    await page.getByRole('button', { name: 'Add to cart', exact: true }).isDisabled(),
    true,
  )
})

test('a sold out product added anyway leaves no cart, and says so', async () => {
  const page = await site.open()
  await site.go(page, '/p/product-1')
  await site.sql(`update products set stock = 0 where slug = 'product-1'`)
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await see(page.getByText('That one just sold out.'))
  assert.equal(await site.sql('select count(*) from carts'), '0')
  assert.equal(
    (await page.context().cookies()).some((c) => c.name === 'cart'),
    false,
  )
})

test('the cart stops at the stock', async () => {
  await site.sql(`update products set stock = 2 where slug = 'product-1'`)
  const page = await site.open()
  await site.go(page, '/p/product-1')
  const add = page.getByRole('button', { name: 'Add to cart', exact: true })
  for (const n of [1, 2]) {
    await add.click()
    await see(page.getByRole('link', { name: `Cart (${n})`, exact: true }))
  }
  await add.click()
  await eventually(async () =>
    assert.equal(await site.sql('select sum(quantity) from cart_items'), '2'),
  )
  await see(page.getByRole('link', { name: 'Cart (2)', exact: true }))
})

test('the cart cookie is HttpOnly, Lax and sixty days, and a bad one is no cart', async () => {
  const page = await site.open()
  await site.go(page, '/p/product-1')
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await see(page.getByRole('link', { name: 'Cart (1)', exact: true }))
  const cookie = (await page.context().cookies()).find((c) => c.name === 'cart')
  assert.equal(cookie.httpOnly, true)
  assert.equal(cookie.sameSite, 'Lax')
  assert.equal(Math.round((cookie.expires - Date.now() / 1000) / 86400), 60)
  const bad = await site.open()
  await bad.context().addCookies([{ name: 'cart', value: 'x'.repeat(36), url: site.url }])
  assert.equal((await site.go(bad, '/p/product-1')).status(), 200)
  await see(bad.getByRole('link', { name: 'Cart (0)', exact: true }))
})

test('/cart is public: an empty cart, then lines by name you can step and remove', async () => {
  const page = await site.open()
  await site.go(page, '/cart')
  await see(page.getByRole('heading', { name: 'Your cart is empty' }))
  await site.sql(`update products set stock = 50 where slug in ('product-1', 'product-2')`)
  for (const slug of ['product-2', 'product-1']) {
    await site.go(page, `/p/${slug}`)
    const count = Number((await cart(page).innerText()).match(/\d+/)[0])
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
    await see(page.getByRole('link', { name: `Cart (${count + 1})`, exact: true }))
  }
  await site.go(page, '/cart')
  const list = page.getByRole('list', { name: 'Cart' })
  const names = (
    await site.rows(
      `select name from products where slug in ('product-1', 'product-2') order by name, id`,
    )
  ).map((r) => r.name)
  assert.deepEqual(await list.getByRole('link').allInnerTexts(), names)
  await see(page.getByText('Subtotal'))
  await page.getByRole('button', { name: `One more ${names[0]}`, exact: true }).click()
  await see(page.getByRole('link', { name: 'Cart (3)', exact: true }))
  await eventually(async () =>
    assert.equal(await site.sql('select sum(quantity) from cart_items'), '3'),
  )
  await page.getByRole('button', { name: `One fewer ${names[0]}`, exact: true }).click()
  await page.getByRole('button', { name: `One fewer ${names[0]}`, exact: true }).click()
  await see(page.getByRole('link', { name: 'Cart (1)', exact: true }))
  await page.getByRole('button', { name: `Remove ${names[1]}`, exact: true }).click()
  await see(page.getByRole('heading', { name: 'Your cart is empty' }))
  await eventually(async () => assert.equal(await site.sql('select count(*) from cart_items'), '0'))
  await see(page.getByRole('link', { name: 'Cart (0)', exact: true }))
})

test('unknown slugs land on the same page', async () => {
  const page = await site.open()
  await site.go(page, '/p/no-such-product')
  await see(page.getByRole('heading', { level: 1, name: 'Not on the shelves' }))
  await see(page.getByRole('link', { name: 'Back to the aisles', exact: true }))
})
