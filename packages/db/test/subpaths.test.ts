// A subpath loads its own driver and no other, so an app with SQLite never touches Prisma or Mongo. A static walk of each
// entry's imports, then the same claim at run time: every driver is replaced by a stub that records being loaded.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { driver } from '../src/driver'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const DRIVERS = Object.keys(pkg.peerDependenciesMeta)

const OWN: Record<string, string[]> = {
  './sql': [],
  './kysely': ['kysely'],
  './prisma': [],
  './mongo': [],
  './dynamodb': ['@aws-sdk/lib-dynamodb'],
  './firestore': [],
  './plugin-native': [],
  './plugin-native/sqlite': [],
  './plugin-native/postgres': ['postgres'],
  './plugin-native/mysql': ['mysql2'],
  './plugin-native/auth': ['kysely'],
  './plugin-prisma': [],
}
const entries = Object.keys(pkg.exports).filter((k) => !k.endsWith('/plugin'))

/** Every package a file reaches by a value import, static or dynamic, through relative files. */
function reached(file: string, seen = new Set<string>(), out = new Set<string>()) {
  if (seen.has(file)) return out
  seen.add(file)
  const text = readFileSync(file, 'utf8').replace(/^\s*(?:\/\/|\/?\*).*$/gm, '') // a comment can name a driver
  for (const m of text.matchAll(
    /^(?:import|export)\s+(?!type\b)[^'"\n]*from\s+['"]([^'"]+)['"]|\bimport\(['"]([^'"]+)['"]\)/gm,
  )) {
    const spec = (m[1] ?? m[2])!
    if (!spec.startsWith('.'))
      out.add(
        spec
          .split('/')
          .slice(0, spec.startsWith('@') ? 2 : 1)
          .join('/')
          .replace(/^mysql2.*/, 'mysql2'),
      )
    else reached(resolve(dirname(file), `${spec}.ts`), seen, out)
  }
  return out
}

test('every subpath is in the table', () => expect(entries.sort()).toEqual(Object.keys(OWN).sort()))

describe.each(entries)('%s', (entry) => {
  const file = join(root, pkg.exports[entry])

  test('imports no driver but its own', () => {
    const drivers = [...reached(file)].filter((d) => DRIVERS.includes(d))
    expect(drivers.sort()).toEqual(OWN[entry])
  })

  test('loads no other driver when it runs', async () => {
    const loaded: string[] = []
    for (const name of [...DRIVERS, 'mysql2/promise'])
      vi.doMock(name, async (original) => {
        loaded.push(name)
        return original()
      })
    vi.resetModules()
    await import(/* @vite-ignore */ file)
    expect(loaded.map((d) => d.replace(/\/promise$/, ''))).toEqual(OWN[entry])
  })
})

afterEach(() => {
  for (const name of [...DRIVERS, 'mysql2/promise']) vi.doUnmock(name)
})

test('a missing driver names the install command', async () => {
  await expect(
    // @ts-expect-error the point is a package that isn't there
    driver('@weft-js/db/kysely', 'not-installed-driver', () => import('not-installed-driver')),
  ).rejects.toThrow(
    "@weft-js/db/kysely needs the `not-installed-driver` driver, which isn't installed. Run: npm install not-installed-driver",
  )
})

test('a driver that fails for another reason keeps its own error', async () => {
  await expect(
    driver('@weft-js/db/kysely', 'kysely', () => Promise.reject(new Error('boom'))),
  ).rejects.toThrow('boom')
})
