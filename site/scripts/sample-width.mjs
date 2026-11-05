// Count wide source samples without importing the content generator or compiler.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SHOWN } from './content/displayed.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// Markdown container markers do not occupy columns in the rendered code block.
const unquote = (text, limit = Infinity) => {
  let line = text
  let depth = 0
  while (depth < limit) {
    const marker = /^ {0,3}>[ \t]?/.exec(line)
    if (!marker) break
    line = line.slice(marker[0].length)
    depth++
  }
  return { line, depth }
}
const columns = (line) => [...line].reduce((n, c) => (c === '\t' ? n + 4 - (n % 4) : n + 1), 0)

/** Return the line numbers and widths of code inside Markdown fences that exceed the limit. */
export function scanMarkdown(text, limit = 70) {
  const violations = []
  let fence = null
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    let quoted = unquote(raw, fence?.depth)
    if (fence && quoted.depth < fence.depth) {
      fence = null
      quoted = unquote(raw)
    }
    const line = quoted.line
    if (!fence) {
      const match = /^(\s*(?:(?:[-+*]|\d+[.)])[ \t]+)?)(`{3,}|~{3,})(.*)$/.exec(line)
      if (match && !(match[2][0] === '`' && match[3].includes('`'))) {
        fence = {
          char: match[2][0],
          length: match[2].length,
          indent: match[1].length,
          depth: quoted.depth,
        }
      }
    } else {
      const closing = /^\s*(`+|~+)\s*$/.exec(line)
      if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) {
        fence = null
        continue
      }
      const content = line.replace(new RegExp(`^ {0,${fence.indent}}`), '')
      const width = columns(content)
      if (width > limit) violations.push({ line: index + 1, width, limit })
    }
  }
  return violations
}

/** Return the line numbers and widths of source lines that exceed the split-pane limit. */
export function scanSource(text, limit = 58) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const width = columns(line)
    return width > limit ? [{ line: index + 1, width, limit }] : []
  })
}

function walk(dir, accept) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (
        ['node_modules', 'public', 'generated', '__snapshots__', 'dist', 'build'].includes(
          entry.name,
        )
      )
        return []
      return walk(join(dir, entry.name), accept)
    }
    return entry.isFile() && accept(entry.name) ? [join(dir, entry.name)] : []
  })
}

/** Scan canonical Markdown and split-pane sources under a repository root. */
export function scanSamples(repo = root) {
  const markdown = [
    join(repo, 'README.md'),
    ...walk(join(repo, 'docs'), (n) => n.endsWith('.md')),
    ...walk(join(repo, 'site/content'), (n) => n.endsWith('.md')),
    ...walk(join(repo, 'packages'), (n) => n === 'README.md' || n.endsWith('.md')),
  ]
  const sources = ['site/src/toolkit/examples', 'site/src/demos', 'site/src/toolkit/world'].flatMap(
    (dir) => walk(join(repo, dir), (n) => /\.[cm]?[jt]sx?$/.test(n)),
  )
  const world = join(repo, 'site/src/toolkit/world.ts')
  if (existsSync(world)) sources.push(world)
  sources.push(
    ...Object.values(SHOWN)
      .map((path) => join(repo, path))
      .filter(existsSync),
  )
  const files = [...new Set(markdown)]
    .filter(existsSync)
    .map((path) => [path, scanMarkdown])
    .concat(sources.map((path) => [path, scanSource]))
  return files.flatMap(([path, scan]) =>
    scan(readFileSync(path, 'utf8')).map((v) => ({ file: relative(repo, path), ...v })),
  )
}

/** Fail when any canonical code sample exceeds its width. */
export function reportSampleWidths(repo = root) {
  const violations = scanSamples(repo)
  if (violations.length) {
    const details = violations.map(
      (v) => `${v.file}:${v.line}: ${v.width} columns (limit ${v.limit})`,
    )
    throw new Error(`[sample-width] ${violations.length} violations:\n${details.join('\n')}`)
  }
  console.log('[sample-width] 0 violations')
  return violations
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  reportSampleWidths()
