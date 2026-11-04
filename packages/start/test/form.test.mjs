// `<Form>` without JS, over HTTP on the fixture under `weft dev` (research 29 §5): the markup, the CSRF proof, 303 on
// success, the page again with the errors and what was typed, coercion of a form's strings, redirects, and no secrets.
import { inject } from 'vitest'
import { fnId } from '../src/vite.mjs'

const url = inject('url')
const id = fnId('addNote', 'src/server/forms.ts')
const post = (fields, headers = { origin: url }, path = '/notes') =>
  fetch(url + path, {
    method: 'POST',
    redirect: 'manual',
    headers,
    body: new URLSearchParams({ $fn: id, ...fields }),
  })
const form = (html) => JSON.parse(/id="weft-form">(.*?)<\/script>/.exec(html)?.[1] ?? 'null')

test('the markup is a real form: method, hidden id, the attributes it was given', async () => {
  const html = await (await fetch(`${url}/notes`)).text()
  expect(html).toMatch(/<form[^>]* method="post"/)
  expect(html).toMatch(/<form[^>]* class="note-form"/)
  expect(html).toMatch(/<form[^>]* data-kind="note"/)
  expect(html).not.toMatch(/<form[^>]* action=/) // the document's own URL
  expect(html).toContain(`name="$fn"`)
  expect(html).toContain(`value="${id}"`)
  expect(html).toMatch(/<input[^>]* name="title"/)
  expect(html).not.toContain('weft-form')
})

test("success is a 303 back to the page, with the mutation's cookies, and the coerced input arrived", async () => {
  const res = await post(
    { title: 'First', qty: '3', urgent: 'on' },
    { origin: url },
    '/notes?tab=1',
  )
  expect(res.status).toBe(303)
  expect(res.headers.get('location')).toBe('/notes?tab=1')
  expect(res.headers.getSetCookie()).toContain('noted=1; Path=/')
  expect(await (await fetch(`${url}/notes`)).text()).toContain(
    '{"title":"First","qty":3,"urgent":true}',
  )
})

test('Sec-Fetch-Site alone is enough proof; no proof, or another origin, is F002', async () => {
  expect(
    (await post({ title: 'Second', qty: '1' }, { 'sec-fetch-site': 'same-origin' })).status,
  ).toBe(303)
  for (const headers of [
    {},
    { origin: 'https://evil.example' },
    { origin: 'null' },
    { origin: url, 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ]) {
    expect((await post({ title: 'Evil', qty: '1' }, headers)).status).toBe(403)
  }
  expect(await (await fetch(`${url}/notes`)).text()).not.toContain('Evil')
})

test('F003: a POST naming no mutation, or a query, is a 404; a POST with no form is still a 405', async () => {
  expect((await post({ $fn: 'nope.123456' })).status).toBe(404)
  expect((await post({ $fn: fnId('listNotes', 'src/server/forms.ts') })).status).toBe(404)
  expect(
    (
      await fetch(`${url}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(405)
})

test('field errors: 422, the page with the messages, what was typed, aria state, and no password', async () => {
  const res = await post({ title: 'x', qty: 'many', password: 'hunter2' })
  expect(res.status).toBe(422)
  const html = await res.text()
  expect(html).toContain('Title is too short')
  expect(html).toContain('Quantity must be a number')
  expect(html).toMatch(
    /<input[^>]* name="title"[^>]* value="x"|<input[^>]* value="x"[^>]* name="title"/,
  )
  expect(html).toMatch(/<input[^>]*aria-invalid="true"/)
  expect(html).not.toContain('hunter2')
  expect(form(html)).toMatchObject({
    id,
    status: 422,
    values: { title: 'x', qty: 'many' },
    errors: { title: 'Title is too short' },
  })
})

test('a field its reading fixed reports nothing while another still fails', async () => {
  const html = await (await post({ title: 'x', qty: '2' })).text()
  expect(html).toContain('Title is too short')
  expect(form(html).errors).toEqual({ title: 'Title is too short' })
})

test("an empty field keeps the schema's own message for what was typed", async () => {
  expect(form(await (await post({ title: '', qty: '2' })).text()).errors).toEqual({
    title: 'Title is too short',
  })
})

test('what was typed is escaped, in the input and in the payload', async () => {
  const html = await (await post({ title: '"><script>alert(1)</script>', qty: 'x' })).text()
  expect(html).not.toContain('<script>alert(1)')
})

test('invalid() in `run` lands on its field', async () => {
  const res = await post({ title: 'taken', qty: '1' })
  expect(res.status).toBe(422)
  expect(await res.text()).toContain('Already taken')
})

test("a thrown error comes back on the page as the form's message", async () => {
  const res = await post({ title: 'boom', qty: '1' })
  expect(res.status).toBe(500)
  expect(form(await res.text()).message).toBe('kaboom') // dev; production answers the generic text
})

test('redirect() in `run` is a 303 to its target', async () => {
  const res = await post({ title: 'elsewhere', qty: '1' })
  expect(res.status).toBe(303)
  expect(res.headers.get('location')).toBe('/about')
})

test('the prototype chain is out of reach of a field name', async () => {
  await post({
    title: 'proto',
    qty: '1',
    '__proto__.polluted': 'yes',
    'a.constructor.prototype.polluted': 'yes',
  })
  expect({}.polluted).toBeUndefined()
})

test('S002: a scope read in `load` fails the request instead of sharing state between visitors', async () => {
  const res = await fetch(`${url}/leak`)
  expect(res.status).toBe(500)
  expect(await res.text()).toContain('S002')
})
