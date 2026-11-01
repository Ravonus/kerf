import { test } from 'node:test'
import { assert, eventually, see, site } from '../lib/e2e-kit.mjs'

const joined = /You're on the list/

for (const path of ['/', '/pricing', '/privacy']) {
  test(`${path} answers 200 and has a heading`, async () => {
    const page = await site.open(), r = await site.go(page, path)
    assert.equal(r.status(), 200)
    await see(page.getByRole('heading'))
  })
}

test('the home page has the hero image', async () => {
  const page = await site.open()
  await site.go(page, '/')
  await see(page.getByRole('img'))
})

test('joining the waitlist adds the row and says so', async () => {
  const page = await site.open(), email = 'someone@bench.test'
  await site.go(page, '/')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await see(page.getByText(joined))
  await eventually(async () => assert.equal(await site.sql(`select count(*) from waitlist where email = '${email}'`), '1'))
})

test('the form works with JavaScript off', async () => {
  const page = await site.open({ js: false }), email = 'nojs@bench.test'
  await site.go(page, '/')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await see(page.getByText(joined))
  assert.equal(await site.sql(`select count(*) from waitlist where email = '${email}'`), '1')
})
