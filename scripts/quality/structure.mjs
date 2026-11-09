// List syntax-verifiable structure warnings without changing tracked files.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { classify, isGenerated } from './categories.mjs'

const ts = createRequire(new URL('../../packages/cli/package.json', import.meta.url))('typescript')
const sourcePattern =
  /^(?:packages\/[^/]+|site|crates\/[^/]+)\/src\/.*\.(?:ts|tsx|js|jsx|mjs|cjs|rs)$/
const sourceRoot = /^(?:packages\/[^/]+|site|crates\/[^/]+)\/src$/

/** Check tracked source paths, test mirrors and index declarations. */
export function structure(files, read = (file) => readFileSync(file, 'utf8')) {
  const source = files.filter((file) => sourcePattern.test(file))
  const folders = new Map()
  const warnings = []
  const all = new Set(files)
  for (const file of source) {
    const folder = dirname(file)
    folders.set(folder, (folders.get(folder) ?? 0) + 1)
    const name = file.slice(file.lastIndexOf('/') + 1)
    if (name.endsWith('.tsx') && !/^[A-Z][A-Za-z0-9]*\.tsx$/.test(name))
      warnings.push(`${file}: TSX name should be PascalCase`)
    if (name.endsWith('.ts') && !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.d)?\.ts$/.test(name))
      warnings.push(`${file}: TypeScript module name should be kebab-case`)
    if (name === 'index.ts') {
      const tree = ts.createSourceFile(
        file,
        read(file),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      if (
        tree.parseDiagnostics.length ||
        tree.statements.some(
          (statement) => !ts.isExportDeclaration(statement) || !statement.moduleSpecifier,
        )
      )
        warnings.push(`${file}: index should only re-export (or has syntax errors)`)
    }
  }
  for (const [folder, count] of folders) {
    if (count > 12) warnings.push(`${folder}: ${count} source files (maximum 12)`)
    if (!sourceRoot.test(folder) && count < 3)
      warnings.push(`${folder}: ${count} source files (minimum 3)`)
  }
  const tests = files.filter((file) =>
    /^(?:packages\/[^/]+|site)\/test\/.*\.(?:test|e2e)\.(?:ts|tsx)$/.test(file),
  )
  for (const file of tests) {
    const base = file.replace('/test/', '/src/').replace(/\.(?:test|e2e)\.(?:ts|tsx)$/, '')
    if (!['.ts', '.tsx'].some((extension) => all.has(base + extension)))
      warnings.push(`${file}: no matching source path (test mirror)`)
  }
  return { warnings, source: source.length, folders: folders.size, tests: tests.length }
}

/** Classify tracked code and CSS paths, retaining generated metadata. */
export function inventory(files, read = (file) => readFileSync(file, 'utf8')) {
  const source = files.filter((file) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|rs|css)$/.test(file))
  const unclassified = []
  let generated = 0
  for (const file of source) {
    const content = read(file)
    if (isGenerated(file, content)) generated++
    if (!classify(file, { content })) unclassified.push(file)
  }
  return { source: source.length, generated, unclassified }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
  const result = structure(files)
  const classified = inventory(files)
  console.log(
    `Tracked files: ${files.length}; source files: ${result.source}; source folders: ${result.folders}; test paths: ${result.tests}`,
  )
  console.log(
    `Classification candidates: ${classified.source}; generated: ${classified.generated}; unclassified: ${classified.unclassified.length}`,
  )
  for (const file of classified.unclassified) console.log(`${file}: unclassified source`)
  for (const warning of result.warnings) console.log(warning)
  console.log(`Warnings: ${result.warnings.length}`)
}
