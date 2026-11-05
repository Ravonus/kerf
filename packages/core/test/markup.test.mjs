// The markup subpath runs in Node as well as browser code, with each caller's escaping policy.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { esc, markup } from '@weft-js/core/markup'
import { markup as originalMarkup } from '../src/markup.mjs'

void test('esc preserves the three HTML contexts', () => {
  const input = `&<>"' &amp;`
  assert.equal(esc(input), `&amp;&lt;>&quot;' &amp;amp;`)
  assert.equal(esc(input, 'text'), `&amp;&lt;&gt;"' &amp;amp;`)
  assert.equal(esc(input, 'full'), `&amp;&lt;&gt;&quot;' &amp;amp;`)
  assert.equal(esc(''), '')
  for (const mode of ['attribute', 'text', 'full'])
    for (const value of [null, undefined]) assert.throws(() => esc(value, mode), TypeError)
})

void test('markup retains its existing export', () => {
  assert.equal(markup, originalMarkup)
  assert.ok(markup('<p class="greeting">Hi</p>').has('.greeting'))
})
