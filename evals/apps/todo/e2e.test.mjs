import { test } from 'node:test'
import { assert, eventually, gone, see, site, user } from '../lib/e2e-kit.mjs'

const box = (page, title) => page.getByRole('checkbox', { name: title, exact: true })
const list = page => page.getByRole('list', { name: 'Todos', exact: true })
const mine = "user_id = 'bench-user'"

test('signed out, /todos redirects to /login', async () => {
  const page = await site.open()
  await site.go(page, '/todos')
  await page.waitForURL(u => u.pathname === '/login')
  await see(page.getByRole('button', { name: 'Sign in', exact: true }))
})

test('a wrong password does not sign in', async () => {
  const page = await site.open()
  await site.go(page, '/login')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForTimeout(800)
  await site.go(page, '/todos')
  await page.waitForURL(u => u.pathname === '/login')
})

test('signed in, the list shows the seeded rows', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await see(box(page, 'Seeded todo 1'))
  assert.equal(await list(page).getByRole('listitem').count(), 200)
})

test("another user's rows aren't visible", async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await see(box(page, 'Seeded todo 1'))
  assert.equal(await page.getByText('Other user todo').count(), 0)
})

test('add puts a row on the page and in the database', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await page.getByRole('textbox', { name: 'New todo', exact: true }).fill('Buy lemons')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await see(box(page, 'Buy lemons'))
  await eventually(async () => assert.equal(await site.sql(`select count(*) from todos where ${mine} and title = 'Buy lemons'`), '1'))
})

test('toggle survives a reload', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await box(page, 'Seeded todo 1').click()
  await eventually(async () => assert.equal(await site.sql(`select done from todos where ${mine} and title = 'Seeded todo 1'`), 't'))
  await site.go(page, '/todos')
  assert.equal(await box(page, 'Seeded todo 1').isChecked(), true)
})

test('delete removes the row', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await page.getByRole('button', { name: 'Delete Seeded todo 2', exact: true }).click()
  await gone(box(page, 'Seeded todo 2'))
  await eventually(async () => assert.equal(await site.sql(`select count(*) from todos where ${mine} and title = 'Seeded todo 2'`), '0'))
})

test('filter links set ?filter= and narrow the list', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await page.getByRole('link', { name: 'Active', exact: true }).click()
  await page.waitForURL(u => u.searchParams.get('filter') === 'active')
  await gone(box(page, 'Seeded todo 3'))
  await see(box(page, 'Seeded todo 1'))
  await page.getByRole('link', { name: 'Done', exact: true }).click()
  await page.waitForURL(u => u.searchParams.get('filter') === 'done')
  await gone(box(page, 'Seeded todo 1'))
  await see(box(page, 'Seeded todo 3'))
  await page.getByRole('link', { name: 'All', exact: true }).click()
  await see(box(page, 'Seeded todo 1'))
  await see(box(page, 'Seeded todo 3'))
})

test('"N left" counts the undone rows, and moves', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  const left = +(await site.sql(`select count(*) from todos where ${mine} and not done`))
  await see(page.getByText(`${left} left`, { exact: true }))
  await box(page, 'Seeded todo 1').click()
  await see(page.getByText(`${left - 1} left`, { exact: true }))
})

test('signed in, /login goes to /todos', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/login')
  await page.waitForURL(u => u.pathname === '/todos')
})

test('newest first, and a new row lands on top', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await see(box(page, 'Seeded todo 200'))
  const titles = () => list(page).getByRole('checkbox').evaluateAll(all => all.map(e => e.closest('li').innerText.trim()))
  assert.deepEqual((await titles()).slice(0, 2), ['Seeded todo 200', 'Seeded todo 199'])
  await page.getByRole('textbox', { name: 'New todo', exact: true }).fill('Buy lemons')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await see(box(page, 'Buy lemons'))
  assert.equal((await titles())[0], 'Buy lemons')
  await eventually(async () => assert.equal(await site.sql(`select count(*) from todos where ${mine} and title = 'Buy lemons'`), '1'))
  await site.go(page, '/todos')
  assert.equal((await titles())[0], 'Buy lemons')
})

test('a filter link reads the list again', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await see(box(page, 'Seeded todo 1'))
  await site.sql(`update todos set title = 'Changed elsewhere' where ${mine} and title = 'Seeded todo 1'`)
  await page.getByRole('link', { name: 'Active', exact: true }).click()
  await see(box(page, 'Changed elsewhere'))
})

test("a write can't reach another user's row", async () => {
  const [{ id: own }] = await site.rows(`select id from todos where ${mine} and title = 'Seeded todo 1'`)
  const [{ id: theirs }] = await site.rows(`select id from todos where not ${mine} order by id limit 1`)
  const page = await site.open({ signedIn: true })
  await page.route('**/*', route => {
    const r = route.request(), body = r.postDataBuffer()?.toString('latin1')
    return body?.includes(own) ? route.continue({ postData: Buffer.from(body.replaceAll(own, theirs), 'latin1') }) : route.continue()
  })
  await site.go(page, '/todos')
  const posted = page.waitForResponse(r => r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Delete Seeded todo 1', exact: true }).click()
  await posted
  await page.waitForTimeout(300)
  assert.equal(await site.sql(`select count(*) from todos where id = '${theirs}'`), '1')
})
