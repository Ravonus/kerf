import { test } from 'node:test'
import { assert, choose, eventually, see, site } from '../lib/e2e-kit.mjs'

const rows = page => page.getByRole('row').filter({ has: page.getByRole('cell') })

for (const path of ['/admin', '/admin/orders', '/admin/orders/1', '/admin/nested', '/admin/per-row', '/admin/slow']) {
  test(`signed out, ${path} redirects to /login`, async () => {
    const page = await site.open()
    await site.go(page, path)
    await page.waitForURL(u => u.pathname === '/login')
  })
}

test('/admin has the four stats, the chart and the 10 latest orders', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin')
  for (const label of ['Revenue', 'Orders', 'Customers', 'Refunded']) await see(page.getByText(label, { exact: true }))
  assert.equal(await rows(page).count(), 10)
})

test('orders are 50 rows a page, and Next and Previous move through the URL', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders')
  await see(rows(page))
  assert.equal(await rows(page).count(), 50)
  const first = await rows(page).first().textContent()
  await page.getByRole('link', { name: 'Next', exact: true }).click()
  await page.waitForURL(u => u.searchParams.get('page') === '2')
  await eventually(async () => assert.notEqual(await rows(page).first().textContent(), first))
  await page.getByRole('link', { name: 'Previous', exact: true }).click()
  await eventually(async () => assert.equal(await rows(page).first().textContent(), first))
})

test('a column header button sorts on the server, in the URL', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders')
  await page.getByRole('columnheader').getByRole('button').first().click()
  await page.waitForURL(u => u.searchParams.has('sort') && u.searchParams.has('dir'))
})

test('select "Status" filters on the server, in the URL', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders')
  await choose(page.getByRole('combobox', { name: 'Status', exact: true }), 'refunded')
  await page.waitForURL(u => u.searchParams.get('status') === 'refunded')
  await eventually(async () => {
    const text = await rows(page).allTextContents()
    assert.ok(text.length > 0 && text.every(t => /refunded/i.test(t)))
  })
})

test('textbox "Search" finds customers by name, in the URL', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders')
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Ada Reed')
  await page.getByRole('textbox', { name: 'Search', exact: true }).press('Enter')
  await page.waitForURL(u => u.searchParams.get('q') === 'Ada Reed')
  await eventually(async () => {
    const text = await rows(page).allTextContents()
    assert.ok(text.length > 0 && text.every(t => t.includes('Ada Reed')))
  })
})

test('state in the URL holds on a reload', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders?status=shipped&page=2')
  const text = await rows(page).allTextContents()
  assert.ok(text.length > 0 && text.every(t => /shipped/i.test(t)))
})

test('Mark shipped updates the checked rows', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders?status=pending')
  const before = +(await site.sql(`select count(*) from orders where status = 'shipped'`))
  await rows(page).nth(0).getByRole('checkbox').check()
  await rows(page).nth(1).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Mark shipped', exact: true }).click()
  await eventually(async () => assert.equal(+(await site.sql(`select count(*) from orders where status = 'shipped'`)), before + 2))
})

test('an order shows its customer and product names, and select "Status" saves', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders/1')
  await see(page.getByText(await site.sql('select c.name from orders o join customers c on c.id = o.customer_id where o.id = 1')))
  for (const n of (await site.sql('select distinct p.name from order_items i join products p on p.id = i.product_id where i.order_id = 1')).split('\n')) await see(page.getByText(n))
  await choose(page.getByRole('combobox', { name: 'Status', exact: true }), 'refunded')
  await eventually(async () => assert.equal(await site.sql('select status from orders where id = 1'), 'refunded'))
})

test('the shape pages render', async () => {
  const page = await site.open({ signedIn: true })
  assert.equal((await site.go(page, '/admin/nested')).status(), 200)
  await site.go(page, '/admin/per-row')
  await see(page.getByText(await site.sql('select c.name from orders o join customers c on c.id = o.customer_id order by o.created_at desc, o.id desc limit 1')))
})

test('/admin/slow counts while the report streams in', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/slow')
  await see(page.getByRole('region', { name: 'Report', exact: true }), 10000)
  await see(page.getByRole('status').filter({ hasText: 'Count: 0' }))
  await page.getByRole('button', { name: 'Count', exact: true }).click()
  await see(page.getByRole('status').filter({ hasText: 'Count: 1' }))
})
