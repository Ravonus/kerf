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

// Parity: the same words, the same page after joining and the same rules, so what's measured is the framework and not the site.
const chrome = ['Pricing', 'Privacy', 'Get early access', 'Hear what customers keep asking for.', 'hello@emberline.example', '© 2026 Emberline. Built for teams that listen.']
const copy = {
  '/': {
    title: 'Emberline: hear what customers keep asking for',
    text: [
      'Early access opens this winter', 'Hear what customers keep asking for', 'Emberline listens to your customer calls and turns them into a ranked list of what to build next.',
      "We'll write when your place comes up, and not before.", 'Stop losing what customers tell you', 'Every call, heard', 'Ranked, not guessed', 'Proof beside every card',
      'How it works', 'Connect your calls', 'Read the signals', 'Close the loop', 'Your customers already told you what to build.',
    ],
  },
  '/pricing': {
    title: 'Pricing · Emberline',
    text: [
      'Simple pricing that grows with your team', 'Free for one person. Pay per seat when the whole team comes along.', 'Starter', 'Team', 'Enterprise', 'Most popular', '$24', 'Talk to us',
      'Unlimited calls', 'Data residency', 'Join for free', 'Get in line', 'Questions', 'When does it open?', 'Is the early price locked in?', 'What happens to my data if I leave?',
      "It's yours. Export every signal and quote as CSV at any time, on any plan.",
    ],
  },
  '/privacy': {
    title: 'Privacy · Emberline',
    text: [
      'Last updated 1 November 2026', 'What we collect', 'Why we collect it', 'Who sees it', 'How long we keep it', 'Removing your address',
      "Only the people who run Emberline, and the database host that stores it on our behalf. We don't sell or share addresses.",
    ],
  },
  '/joined': { title: "You're on the list · Emberline", text: ["You're on the list", "We'll write when your place in line comes up. Everyone hears from us in the order they joined.", 'See pricing'] },
}

for (const [path, { title, text }] of Object.entries(copy)) {
  test(`${path} says the same thing in every stack`, async () => {
    const page = await site.open({ js: false })
    assert.equal((await site.go(page, path)).status(), 200)
    assert.equal(await page.title(), title)
    const body = (await page.locator('body').textContent()).replace(/\s+/g, ' ')
    for (const s of [...text, ...chrome]) assert.ok(body.includes(s), `${path} doesn't say "${s}"`)
  })
}

test('joining lands on /joined, with JavaScript on or off', async () => {
  for (const js of [true, false]) {
    const page = await site.open({ js })
    await site.go(page, '/')
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`${js}@bench.test`)
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await page.waitForURL(u => u.pathname === '/joined')
  }
})

test('the same address in other capitals joins once, and looks the same', async () => {
  for (const email of ['Twice@Bench.test', 'twice@bench.test']) {
    const page = await site.open()
    await site.go(page, '/')
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await see(page.getByText(joined))
  }
  assert.equal(await site.sql("select string_agg(email, ',') from waitlist where lower(email) = 'twice@bench.test'"), 'twice@bench.test')
})

test('the server refuses a bad address, with JavaScript on or off', async () => {
  for (const js of [true, false]) {
    const page = await site.open({ js })
    await site.go(page, '/')
    await page.evaluate(() => { document.querySelector('form').noValidate = true })
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('nope')
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await see(page.getByText("That doesn't look like an email address."))
    assert.equal(await site.sql('select count(*) from waitlist'), '0')
  }
})

test('joining sets no cookie', async () => {
  for (const js of [true, false]) {
    const page = await site.open({ js })
    await site.go(page, '/')
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`cookie-${js}@bench.test`)
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await see(page.getByText(joined))
    assert.deepEqual(await page.context().cookies(), [])
  }
})

test('another site can\'t post the form', async () => {
  const page = await site.open({ js: false })
  await site.go(page, '/')
  const { action, fields } = await page.evaluate(() => {
    const form = document.querySelector('form')
    return { action: form.action, fields: [...form.querySelectorAll('input[name]')].map(i => [i.name, i.value]) }
  })
  const body = new FormData()
  for (const [k, v] of fields) body.set(k, k === 'email' ? 'forged@bench.test' : v)
  const r = await fetch(action, { method: 'POST', body, redirect: 'manual', headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })
  assert.ok(r.status >= 400, `answered ${r.status}`)
  assert.equal(await site.sql('select count(*) from waitlist'), '0')
})
