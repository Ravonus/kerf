// @vitest-environment node
// The markup subpath preserves each caller's escaping policy.
import { strict as assert } from 'node:assert'
import { test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { esc, markup } from '@kerf-js/core/markup'
import { markup as originalMarkup } from '../src/markup.mjs'

test('esc preserves the three HTML contexts', () => {
  const input = `&<>"' &amp;`
  assert.equal(esc(input), `&amp;&lt;>&quot;' &amp;amp;`)
  assert.equal(esc(input, 'text'), `&amp;&lt;&gt;"' &amp;amp;`)
  assert.equal(esc(input, 'full'), `&amp;&lt;&gt;&quot;' &amp;amp;`)
  assert.equal(esc(''), '')
  for (const mode of ['attribute', 'text', 'full'])
    for (const value of [null, undefined])
      assert.throws(() => esc(value as unknown as string, mode as 'attribute'), TypeError)
})

test('markup retains its existing export', () => {
  assert.equal(markup, originalMarkup)
  assert.ok(markup('<p class="greeting">Hi</p>').has('.greeting'))
})

test('markup loads in Node without a browser runtime', () => {
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    for (const key of ['window', 'document']) {
      Object.defineProperty(globalThis, key, { get() { throw new Error(key) } })
    }
    const { esc, markup } = await import('@kerf-js/core/markup')
    if (esc('<') !== '&lt;' || typeof markup !== 'function') process.exit(1)
  `,
    ],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  )
  assert.equal(probe.status, 0, probe.stderr)
})
