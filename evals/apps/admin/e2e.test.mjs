import { test } from 'node:test'
import { assert, choose, eventually, see, site } from '../lib/e2e-kit.mjs'

const rows = scope => scope.getByRole('row').filter({ has: (scope.page?.() ?? scope).getByRole('cell') })

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

// From here on: what makes the three the same site, not only each a working one.

const cells = async row => (await row.getByRole('cell').allTextContents()).concat(await row.getByRole('rowheader').allTextContents()).join(' ')
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const n = v => Number(v).toLocaleString('en-US')

test('signed in, /login and / go to /admin', async () => {
  const page = await site.open({ signedIn: true })
  for (const path of ['/login', '/']) {
    await site.go(page, path)
    await page.waitForURL(u => u.pathname === '/admin')
  }
})

test('a session cookie that no longer stands goes to /login', async () => {
  const page = await site.open({ signedIn: true })
  await site.sql('delete from session')
  await site.go(page, '/admin/orders')
  await page.waitForURL(u => u.pathname === '/login')
})

test('a write from a signed-out browser changes nothing', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders?status=pending')
  const before = await site.sql(`select count(*) from orders where status = 'shipped'`)
  await rows(page).nth(0).getByRole('checkbox').check()
  await page.context().clearCookies()
  await page.getByRole('button', { name: 'Mark shipped', exact: true }).click()
  await page.waitForTimeout(800)
  assert.equal(await site.sql(`select count(*) from orders where status = 'shipped'`), before)
})

// Not the status: Next's Cache Components send the shell before the order is looked up, so that one answers 200.
test('an order that does not exist says so', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders/99999999')
  await see(page.getByRole('heading', { level: 1, name: 'Nothing on this shelf', exact: true }))
})

test('sort, filter, search and page mean the same rows', async () => {
  const page = await site.open({ signedIn: true })
  const cases = [
    ['/admin/orders', 'order by o.created_at desc, o.id desc'],
    ['/admin/orders?sort=total&dir=asc', 'order by o.total_cents asc, o.id asc'],
    ['/admin/orders?sort=customer&dir=desc&page=3', 'order by c.name desc, o.id desc offset 100'],
    ['/admin/orders?sort=created&dir=asc', 'order by o.created_at asc, o.id asc'],
    ['/admin/orders?sort=id&dir=asc', 'order by o.id asc'],
    ['/admin/orders?status=paid&q=ada&page=2', `where o.status = 'paid' and c.name ilike '%ada%' order by o.created_at desc, o.id desc offset 50`],
  ]
  for (const [path, tail] of cases) {
    await site.go(page, path)
    await see(rows(page))
    const want = await site.rows(`select o.id, c.name from orders o join customers c on c.id = o.customer_id ${tail} limit 50`)
    assert.equal(await rows(page).count(), want.length, path)
    for (const i of [0, want.length - 1]) {
      const text = await rows(page).nth(i).textContent()
      assert.ok(text.includes(`#${want[i].id}`) && text.includes(want[i].name), `${path} row ${i}: ${text} against ${JSON.stringify(want[i])}`)
    }
  }
})

test('the first click on a column sorts it ascending, the second descending, from page 1', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders?page=2')
  await see(rows(page))
  await page.getByRole('columnheader').getByRole('button', { name: /Total/ }).click()
  await page.waitForURL(u => u.searchParams.get('sort') === 'total' && u.searchParams.get('dir') === 'asc' && !u.searchParams.has('page'))
  await page.getByRole('columnheader').getByRole('button', { name: /Total/ }).click()
  await page.waitForURL(u => u.searchParams.get('sort') === 'total' && u.searchParams.get('dir') === 'desc')
})

test('a search keeps the sort and starts again at page 1', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders?sort=total&dir=asc&page=2')
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Ada')
  await page.getByRole('textbox', { name: 'Search', exact: true }).press('Enter')
  await page.waitForURL(u => u.searchParams.get('q') === 'Ada' && u.searchParams.get('sort') === 'total' && !u.searchParams.has('page'))
})

test('the last page has no Next link, the first no Previous link', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders?page=200')
  await see(rows(page))
  assert.equal(await rows(page).count(), 50)
  assert.equal(await page.getByRole('link', { name: 'Next', exact: true }).count(), 0)
  await site.go(page, '/admin/orders')
  await see(rows(page))
  assert.equal(await page.getByRole('link', { name: 'Previous', exact: true }).count(), 0)
})

test('Mark shipped paints before the server answers, and rows stay in a filtered list until it does', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/orders?status=pending')
  await see(rows(page))
  await page.route('**/*', async route => (route.request().method() === 'POST' ? setTimeout(() => route.continue(), 1500) : route.continue()))
  await rows(page).nth(0).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Mark shipped', exact: true }).click()
  await see(rows(page).nth(0).getByText('shipped', { exact: true }), 1000)
})

test('select "Status" paints before the server answers, and shows on /admin afterwards', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin')
  const stat = async () => (await page.getByText('Refunded', { exact: true }).first().locator('xpath=ancestor-or-self::*[contains(., "$")][1]').textContent()).replace('Refunded', '').trim()
  const refunded = await stat()
  await site.go(page, '/admin/orders/1')
  await page.route('**/*', async route => (route.request().method() === 'POST' ? setTimeout(() => route.continue(), 1000) : route.continue()))
  const was = await site.sql('select status from orders where id = 1')
  assert.notEqual(was, 'refunded')
  await eventually(async () => assert.equal(await page.getByRole('combobox', { name: 'Status', exact: true }).inputValue(), was))
  await choose(page.getByRole('combobox', { name: 'Status', exact: true }), 'refunded')
  await eventually(async () => assert.equal(await page.getByRole('combobox', { name: 'Status', exact: true }).inputValue(), 'refunded'), 500)
  await eventually(async () => assert.equal(await site.sql('select status from orders where id = 1'), 'refunded'))
  await site.go(page, '/admin')
  await eventually(async () => assert.notEqual(await stat(), refunded))
})

test('/admin/nested shows the same regions from three levels of loads', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/nested')
  const [{ customers, cities }] = await site.rows('select count(*) as customers, count(distinct city) as cities from customers')
  await see(page.getByText(`${n(customers)} customers across ${n(cities)} cities.`))
  const totals = await site.rows('select c.city, count(*) as orders, sum(o.total_cents) as cents from orders o join customers c on c.id = o.customer_id group by 1 order by 3 desc')
  await see(rows(page))
  assert.equal(await rows(page).count(), totals.length)
  for (const [i, t] of totals.entries()) {
    const text = await cells(rows(page).nth(i))
    assert.ok(text.includes(t.city) && text.includes(n(t.orders)) && text.includes(money(t.cents)), `${text} against ${JSON.stringify(t)}`)
  }
  const best = await site.rows('select c.name, sum(o.total_cents) as cents from orders o join customers c on c.id = o.customer_id group by c.id order by 2 desc limit 5')
  for (const b of best) await see(page.getByText(money(b.cents), { exact: true }))
})

test('/admin/per-row shows 50 orders with customer, city and date', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/per-row')
  await see(rows(page))
  await eventually(async () => assert.equal(await rows(page).count(), 50))
  const [o] = await site.rows(`select o.id, c.name, c.city, to_char(o.created_at at time zone 'UTC', 'Mon FMDD, YYYY') as day from orders o join customers c on c.id = o.customer_id order by o.created_at desc, o.id desc limit 1`)
  await eventually(async () => {
    const text = await cells(rows(page).first())
    for (const part of [`#${o.id}`, o.name, o.city, o.day]) assert.ok(text.includes(part), `${part} in ${text}`)
  })
})

test('/admin/slow reports orders and revenue by status', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/admin/slow')
  const report = page.getByRole('region', { name: 'Report', exact: true })
  const lines = await site.rows('select status, count(*) as orders, sum(total_cents) as cents from orders group by 1 order by 3 desc')
  await see(report.getByText(money(lines[0].cents), { exact: true }), 10000)
  assert.equal(await rows(report).count(), lines.length)
  for (const [i, l] of lines.entries()) {
    const text = await cells(rows(report).nth(i))
    assert.ok(new RegExp(l.status, 'i').test(text) && text.includes(n(l.orders)) && text.includes(money(l.cents)), `${text} against ${JSON.stringify(l)}`)
  }
})

test('one brand and one title on every page', async () => {
  const page = await site.open({ signedIn: true })
  for (const [path, title] of [['/admin', 'Overview'], ['/admin/orders', 'Orders'], ['/admin/orders/1', 'Order #1'], ['/admin/nested', 'Regions'], ['/admin/per-row', 'Order feed'], ['/admin/slow', 'Year report']]) {
    await site.go(page, path)
    await see(page.getByRole('heading', { level: 1, name: title, exact: true }))
    await see(page.getByText('Backroom', { exact: true }))
    assert.ok((await page.title()).includes(title), `${path}: ${await page.title()}`)
  }
})
