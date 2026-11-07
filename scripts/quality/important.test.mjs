// `!important` is for what overrides every template: the user's own settings and a state that must win over any
// component's paint. Anything else is a cascade fight that a later rule, a layer or a selector settles, and an app that
// wants to restyle warp then has to answer it with its own !important.
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url).pathname

/** Where warp's own rules may use it, by the selector or at-rule around the declaration. */
const REASONS = [
  [
    /prefers-reduced-motion|data-motion="reduce"/,
    'reduced motion: the user setting beats every animation',
  ],
  [/forced-colors/, 'forced colours: the system palette beats every paint'],
  [/@media print/, 'print: chrome leaves the page'],
  [
    /\[hidden\]|data-from=|data-until=/,
    'hiding: hidden means hidden, whatever display a component sets',
  ],
  [/data-fx-paused|data-fx-offscreen/, 'paused effects: the motion governor beats every effect'],
  [/skeleton-scope/, 'loading: a skeleton paints over any component inside it'],
  [
    /data-collapse[\]=]|data-loading\]|data-settling\]/,
    'a state that keeps a component usable whatever an app sets',
  ],
]

/** Each `!important` declaration with the preludes (selectors, at-rules) that enclose it. */
export function importants(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const found = [],
    stack = []
  let from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '{') {
      stack.push(text.slice(from, i).trim())
      from = i + 1
    } else if (c === '}') {
      check(text.slice(from, i))
      stack.pop()
      from = i + 1
    } else if (c === ';') {
      check(text.slice(from, i))
      from = i + 1
    }
  }
  function check(decl) {
    if (/!\s*important/.test(decl)) found.push({ decl: decl.trim(), context: stack.join(' { ') })
  }
  return found
}

function cssFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) cssFiles(path, out)
    else if (name.endsWith('.css')) out.push(path)
  }
  return out
}

await test('warp uses !important only to override every template', () => {
  const bad = []
  for (const file of cssFiles(join(root, 'docs/design/warp/tokens')))
    for (const { decl, context } of importants(readFileSync(file, 'utf8')))
      if (!REASONS.some(([re]) => re.test(context)))
        bad.push(`${relative(root, file)}: ${context} { ${decl} }`)
  assert.deepEqual(
    bad,
    [],
    'Settle these with source order, a layer or a selector instead. !important is kept for: ' +
      REASONS.map(([, why]) => why).join('; '),
  )
})

/** An app's own CSS may honour the user's settings the same way; nothing else. examples/lemonstand/solid is the Solid
 * build the benchmarks compare against, kept as its authors would write it. */
const USER_SETTINGS = REASONS.slice(0, 3)

await test('apps, the site and templates use !important only for user settings', () => {
  const dirs = ['site/src', 'examples', 'packages/create/templates']
  const bad = []
  for (const dir of dirs)
    for (const file of cssFiles(join(root, dir)))
      for (const { decl, context } of importants(readFileSync(file, 'utf8')))
        if (
          !USER_SETTINGS.some(([re]) => re.test(context)) &&
          !file.includes('/examples/lemonstand/solid/')
        )
          bad.push(`${relative(root, file)}: ${context} { ${decl} }`)
  assert.deepEqual(
    bad,
    [],
    'warp sits in @layer warp.*, so any unlayered rule already beats it: drop the !important, or raise the selector against your own rule',
  )
})

await test('the scan sees declarations inside nested at-rules', () => {
  const found = importants(
    '@media (forced-colors: active) { :where(a) { color: red !important; b: c } }',
  )
  assert.deepEqual(found, [
    { decl: 'color: red !important', context: '@media (forced-colors: active) { :where(a)' },
  ])
})
