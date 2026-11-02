// The base loads no Stripe code: a rail is chosen by the plugin an app adds, never by importing `@weft-js/pay`.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, vi } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const stripe = join(root, 'src/stripe.ts')
const entries = Object.entries(pkg.exports).filter(([k]) => !k.startsWith('./stripe')).map(([k, v]) => [k, join(root, v as string)])

/** Every file an entry reaches by a value import, static or dynamic. */
function reached(file: string, seen = new Set<string>()) {
  if (seen.has(file)) return seen
  seen.add(file)
  for (const m of readFileSync(file, 'utf8').matchAll(/^(?:import|export)\s+(?!type\b)[^'"\n]*from\s+['"](\.[^'"]+)['"]|\bimport\(['"](\.[^'"]+)['"]\)/gm)) {
    const spec = resolve(dirname(file), (m[1] ?? m[2])!)
    const next = /\.\w+$/.test(spec) ? spec : `${spec}.ts`
    if (existsSync(next)) reached(next, seen) // text in a template the setup writes isn't an import
  }
  return seen
}

test.each(entries)('%s reaches no Stripe file', (_, file) => {
  expect(reached(file)).not.toContain(stripe)
})

test.each(['.', './server'])('importing %s runs no Stripe module', async entry => {
  let loaded = false
  vi.doMock(stripe, () => { loaded = true; return {} })
  vi.resetModules()
  await import(/* @vite-ignore */ join(root, pkg.exports[entry]))
  expect(loaded).toBe(false)
  vi.doUnmock(stripe)
})

test('the rail is its own subpath', () => {
  expect(pkg.exports['./stripe']).toBe('./src/stripe.ts')
  expect(pkg.exports['./stripe/plugin']).toBe('./stripe-plugin.mjs')
})
