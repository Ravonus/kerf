import { test } from 'node:test'
import { assert, eventually, see, site } from '../lib/e2e-kit.mjs'

/** Product links on the page, one per product: a card may link its image and its title. */
const products = page => page.getByRole('link').evaluateAll(a => [...new Set(a.map(x => new URL(x.href).pathname).filter(p => p.startsWith('/p/')))])
const cart = page => page.getByRole('link', { name: /^Cart \(\d+\)$/ })

test('/ shows the categories and 12 featured products', async () => {
  const page = await site.open()
  await site.go(page, '/')
  for (const c of ['Kitchen', 'Garden', 'Office']) await see(page.getByRole('link', { name: c, exact: true }))
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
  assert.equal(one.filter(p => two.includes(p)).length, 0)
})

test('min and max narrow the list, from the URL', async () => {
  const page = await site.open()
  await site.go(page, '/c/kitchen?min=999999999')
  assert.equal((await products(page)).length, 0)
})

test('stock leaves out what is out of stock', async () => {
  const page = await site.open()
  await site.go(page, '/c/kitchen?stock=1')
  const slugs = (await products(page)).map(p => `'${p.slice(3)}'`).join(',')
  assert.ok(slugs)
  assert.equal(await site.sql(`select count(*) from products where slug in (${slugs}) and stock = 0`), '0')
})

test('a product shows its details and 4 related', async () => {
  const page = await site.open()
  await site.go(page, '/p/product-1')
  await see(page.getByText(await site.sql(`select name from products where slug = 'product-1'`)))
  await see(page.getByRole('button', { name: 'Add to cart', exact: true }))
  assert.equal((await products(page)).filter(p => p !== '/p/product-1').length, 4)
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
