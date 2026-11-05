// Compare static diagnostic sites and compile-test assertions with the catalog.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { catalog } from '../../packages/cli/src/catalog.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// These compiler-family rules move to the CLI checker; ownership never exempts coverage.
const mappedCodes = new Set(['W008', 'W030'])
const baselinePath = resolve(root, 'scripts/quality/diagnostic-catalog-baseline.json')

function tracked(...paths) {
  return execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: root })
    .toString().split('\0').filter(Boolean)
}

// The second argument is the code. Unknown expressions fail instead of disappearing.
export function emitted(files) {
  const codes = new Set(), problems = []
  for (const [path, text] of Object.entries(files)) {
    const calls = /\b(?:Diagnostic::new|Self::new)\s*\(/g
    for (const call of text.matchAll(calls)) {
      if (call[0].startsWith('Self::') && path !== 'crates/weft-compiler/src/diag.rs') continue
      const args = text.slice(call.index + call[0].length)
      const match = args.match(/^\s*([^,]+),\s*([^,]+),/)
      const code = match?.[2].trim().match(/^"([A-Z]\d{3})"$/)?.[1]
      if (code) codes.add(code)
      else problems.push(`unrecognized constructor: ${path}: ${match?.[2]?.trim() ?? 'unknown'}`)
    }
  }
  return { codes, problems }
}

// A code in an assertion is evidence of a test, not proof of its semantics.
export function asserted(files) {
  const codes = new Set()
  for (const text of Object.values(files)) {
    for (const assertion of text.matchAll(/\bassert(?:_eq|_ne)?!\s*\([\s\S]*?;/g)) {
      for (const code of assertion[0].matchAll(/"([A-Z]\d{3})"/g)) codes.add(code[1])
    }
  }
  return codes
}

function commentEnd(text, at) {
  if (text.startsWith('//', at)) {
    const end = text.indexOf('\n', at)
    return end < 0 ? text.length : end
  }
  if (text.startsWith('/*', at)) {
    const end = text.indexOf('*/', at + 2)
    return end < 0 ? text.length : end + 2
  }
  return at
}

function quotedEnd(text, at) {
  const quote = text[at]
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue }
    if (text[i] === quote) return i + 1
    if (quote === '`' && text.startsWith('${', i)) {
      let depth = 1
      i += 2
      for (; i < text.length && depth; i++) {
        const comment = commentEnd(text, i)
        if (comment !== i) { i = comment - 1; continue }
        if ('\'"`'.includes(text[i])) { i = quotedEnd(text, i) - 1; continue }
        if (text[i] === '{') depth++
        if (text[i] === '}') depth--
      }
      i--
    }
  }
  return text.length
}

function tokens(text) {
  const out = []
  for (let i = 0; i < text.length;) {
    if (/\s/.test(text[i])) { i++; continue }
    const comment = commentEnd(text, i)
    if (comment !== i) { i = comment; continue }
    if ('\'"`'.includes(text[i])) {
      const end = quotedEnd(text, i)
      out.push({ text: text.slice(i, end), value: text[i] === '`' ? null : text.slice(i + 1, end - 1) })
      i = end
      continue
    }
    const previous = out.at(-1)?.text
    if (text[i] === '/' && (!previous || ['=', '(', ':', ',', '[', 'return', '=>'].includes(previous))) {
      let j = i + 1, bracket = false
      for (; j < text.length; j++) {
        if (text[j] === '\\') { j++; continue }
        if (text[j] === '[') bracket = true
        if (text[j] === ']') bracket = false
        if (text[j] === '/' && !bracket) { j++; break }
      }
      out.push({ text: text.slice(i, j) })
      i = j
      continue
    }
    const word = text.slice(i).match(/^(?:[\w$]+|=>|\?\.)/)?.[0] ?? text[i]
    out.push({ text: word })
    i += word.length
  }
  return out
}

function pairs(list) {
  const stack = [], out = new Map()
  for (let i = 0; i < list.length; i++) {
    if (['(', '[', '{'].includes(list[i].text)) stack.push(i)
    if ([')', ']', '}'].includes(list[i].text)) {
      const open = stack.pop()
      out.set(i, open)
      out.set(open, i)
    }
  }
  return out
}

function cliCodes(files, assertions = false) {
  const codes = new Set()
  for (const text of Object.values(files)) {
    const list = tokens(text), matched = pairs(list), stack = []
    const add = (start, end) => {
      for (const token of list.slice(start, end + 1))
        if (/^[A-Z]\d{3}$/.test(token.value ?? '')) codes.add(token.value)
    }
    for (let i = 0; i < list.length; i++) {
      const name = list[i].text
      if (['(', '[', '{'].includes(name)) stack.push(i)
      if ([')', ']', '}'].includes(name)) stack.pop()
      if (!assertions && name === 'code' && list[i + 1]?.text === ':') {
        const object = stack.findLast((at) => list[at].text === '{')
        const call = stack.some((at) => list[at].text === '('
          && ['diagnostic', 'note'].includes(list[at - 1]?.text))
        if (list[object - 1]?.text === 'return' || call) add(i + 2, i + 2)
      }
      if (!assertions || list[i + 1]?.text !== '(') continue
      if (['deepStrictEqual', 'strictEqual', 'ok'].includes(name)) add(i + 1, matched.get(i + 1))
      if (!/^to[A-Z]\w*$/.test(name) || list[i - 1]?.text !== '.') continue
      let end = i - 2
      while (list[end]?.text !== ')' && list[end - 1]?.text === '.') end -= 2
      const open = matched.get(end)
      if (list[open - 1]?.text === 'expect') add(open, matched.get(i + 1))
    }
  }
  return codes
}

export function gaps(catalog, source, tests, cli = { source: {}, tests: {} }) {
  const entries = catalog.filter((entry) => entry.by === 'compiler' || mappedCodes.has(entry.code))
  const compiler = new Set(entries
    .filter((entry) => entry.by === 'compiler').map((entry) => entry.code))
  const { codes, problems } = emitted(source)
  const covered = asserted(tests)
  const cliEmits = cliCodes(cli.source), cliTests = cliCodes(cli.tests, true)
  const missing = []
  for (const entry of entries) {
    const owner = entry.by === 'compiler'
    if (!owner && entry.by !== 'cli') problems.push(`unsupported owner: ${entry.code}`)
    if (!(owner ? codes : cliEmits).has(entry.code)) missing.push(`missing emit: ${entry.code}`)
    if (!(owner ? covered : cliTests).has(entry.code)) missing.push(`missing test: ${entry.code}`)
  }
  for (const code of codes) if (!compiler.has(code)) missing.push(`missing entry: ${code}`)
  for (const code of cliEmits) if (mappedCodes.has(code)
    && !entries.some((entry) => entry.code === code && entry.by === 'cli')) missing.push(`missing entry: ${code}`)
  return { missing: missing.sort(), problems }
}

export function compare(result, baseline) {
  const known = new Set(baseline), current = new Set(result.missing)
  return [...result.problems, ...result.missing.filter((gap) => !known.has(gap)),
    ...baseline.filter((gap) => !current.has(gap)).map((gap) => `stale baseline: ${gap}`)]
}

function readFiles(paths) {
  return Object.fromEntries(paths.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]))
}

export function check() {
  const source = tracked('crates/weft-compiler/src/*.rs', 'crates/weft-compiler/src/**/*.rs')
  const tests = tracked('crates/weft-compiler/tests/compile.rs', 'crates/weft-compiler/tests/compile/*.rs')
  const cliSource = tracked('packages/cli/src').filter((path) => /\.(?:mjs|cjs)$/.test(path))
  const cliTests = tracked('packages/cli/test').filter((path) => /\.(?:ts|tsx|mjs)$/.test(path))
  const result = gaps(catalog, readFiles(source), readFiles(tests), {
    source: readFiles(cliSource), tests: readFiles(cliTests),
  })
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  return { problems: compare(result, baseline), source: source.length, tests: tests.length,
    cliSource: cliSource.length, cliTests: cliTests.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = check()
  console.log(`Checked ${result.source} tracked source files and ${result.tests} tracked compile test files (git ls-files).`)
  console.log(`Checked ${result.cliSource} tracked CLI source files and ${result.cliTests} CLI test files (git ls-files).`)
  for (const problem of result.problems) console.error(problem)
  if (result.problems.length) process.exitCode = 1
}
