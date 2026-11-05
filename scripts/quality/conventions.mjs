// Check the paths in Git, including the import closure of untranspiled Node entries.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function tracked(cwd = process.cwd()) {
  return execFileSync('git', ['ls-files', '-z', '--', 'packages'], { cwd, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

function references(text) {
  return [
    ...text.matchAll(
      /(?:from\s*|import\s*\(|import\s*|require\s*\(|new\s+URL\s*\()\s*['"](\.[^'"]+\.mjs)['"]/g,
    ),
  ].map((match) => match[1])
}

function nodeClosure(files, cwd) {
  const all = new Set(files)
  const roots = files.filter(
    (f) =>
      /^packages\/[^/]+\/(?:scripts\/|bin\/|test\/e2e\/|[^/]+\.mjs$)/.test(f) && f.endsWith('.mjs'),
  )
  for (const manifest of files.filter((f) => /^packages\/[^/]+\/package\.json$/.test(f))) {
    const text = readFileSync(resolve(cwd, manifest), 'utf8')
    for (const match of text.matchAll(/"(\.\/src\/[^"*]+\.mjs)"/g)) {
      const entry = posix.join(dirname(manifest), match[1])
      if (all.has(entry)) roots.push(entry)
    }
  }
  const seen = new Set()
  while (roots.length) {
    const file = roots.pop()
    if (seen.has(file) || !all.has(file)) continue
    seen.add(file)
    for (const ref of references(readFileSync(resolve(cwd, file), 'utf8'))) {
      roots.push(posix.normalize(posix.join(dirname(file), ref)))
    }
  }
  return seen
}

export function conventions(files, cwd = process.cwd()) {
  const node = nodeClosure(files, cwd)
  const problems = []
  const source = files.filter((f) => /^packages\/[^/]+\/src\//.test(f))
  for (const file of source) {
    if (
      /\.(?:js|jsx|cjs|mjs)$/.test(file) &&
      !file.startsWith('packages/cli/src/') &&
      !node.has(file)
    )
      problems.push(
        `${file}: source must be TypeScript or reachable from an untranspiled Node entry`,
      )
  }
  const tests = files.filter((f) => /^packages\/[^/]+\/test\//.test(f))
  for (const file of tests) {
    if (/\.spec\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file))
      problems.push(`${file}: package tests use the .test suffix`)
    if (/\.test\.(?:js|jsx|mjs|cjs)$/.test(file))
      problems.push(`${file}: package tests use .test.ts or .test.tsx`)
  }
  for (const file of files.filter(
    (f) => /^packages\/[^/]+\//.test(f) && /\.test\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(f),
  )) {
    if (
      !/^packages\/[^/]+\/test\//.test(file) &&
      file !== 'packages/core/scripts/node-style.test.mjs'
    )
      problems.push(`${file}: put package tests in test/`)
  }
  const configs = files.filter((f) => /^packages\/[^/]+\/vitest\.config\./.test(f))
  for (const manifest of files.filter((f) => /^packages\/[^/]+\/package\.json$/.test(f))) {
    const pkg = JSON.parse(readFileSync(resolve(cwd, manifest), 'utf8'))
    const config = `${dirname(manifest)}/vitest.config.ts`
    if (pkg.scripts?.test?.includes('vitest') && !files.includes(config))
      problems.push(`${manifest}: Vitest package needs vitest.config.ts`)
  }
  for (const file of configs) {
    if (!file.endsWith('/vitest.config.ts')) problems.push(`${file}: use vitest.config.ts`)
  }
  for (const file of files.filter((f) => /^packages\/[^/]+\/scripts\/[^/]*e2e[^/]*\.mjs$/.test(f)))
    problems.push(`${file}: put e2e entrypoints in test/e2e`)
  return {
    problems,
    counts: {
      tracked: files.length,
      source: source.length,
      tests: tests.length,
      configs: configs.length,
      node: node.size,
    },
  }
}

export function conventionsStep(run, lines) {
  return {
    id: 'conventions',
    covers: 'tracked source extensions, test locations and Vitest configs',
    fix: 'Follow the source and test conventions in CONTRIBUTING.md.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/conventions.mjs'])),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { problems, counts } = conventions(tracked())
  console.log(`conventions: ${JSON.stringify(counts)}`)
  for (const problem of problems) console.error(problem)
  if (problems.length) process.exitCode = 1
}
