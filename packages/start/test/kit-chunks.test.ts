import { describe, expect, it } from 'vitest'
import { KIT_CHUNKS, packageLazy } from '../src/vite/shared.mjs'

const pkg = (p: string) => `/app/node_modules/@kerf-js/${p}`
type Info = { isEntry?: boolean; importers?: string[]; dynamicImporters?: string[] }

/** A module graph as rolldown's `getModuleInfo` reads it, from each module's importers. */
function graph(mods: Record<string, Info>) {
  return (id: string) =>
    mods[id] && {
      isEntry: false,
      importers: [],
      dynamicImporters: [],
      ...mods[id],
    }
}

const mods: Record<string, Info> = {
  '/app/entry.ts': { isEntry: true },
  '\0virtual:kerf/routes': { importers: ['/app/entry.ts'] },
  '/app/src/page.tsx': { dynamicImporters: ['\0virtual:kerf/routes'] },
  [pkg('core/dom.ts')]: { importers: ['/app/entry.ts', '/app/src/page.tsx'] },
  [pkg('text/measure.mjs')]: { importers: [pkg('core/dom.ts')] },
  // the text engine: only behind measure()'s import(), and shared by two of its own lazy chunks
  [pkg('text/engine.js')]: { dynamicImporters: [pkg('text/measure.mjs')] },
  [pkg('text/pack.js')]: { dynamicImporters: [pkg('text/engine.js')] },
  [pkg('text/tables.js')]: { importers: [pkg('text/engine.js'), pkg('text/pack.js')] },
  // the app's own import() of a kerf module is the app's split, so it may share the kit
  '/app/src/later.ts': { dynamicImporters: ['/app/src/page.tsx'] },
  [pkg('veneer/Chart.tsx')]: { dynamicImporters: ['/app/src/later.ts', pkg('text/measure.mjs')] },
  // a cycle behind a package's import()
  [pkg('a.js')]: { importers: [pkg('b.js')], dynamicImporters: [pkg('text/measure.mjs')] },
  [pkg('b.js')]: { importers: [pkg('a.js')] },
}

describe("the kit chunks leave out what only a package's own import() loads", () => {
  const info = graph(mods)
  it('knows a package-lazy module by its importers', () => {
    for (const id of ['text/engine.js', 'text/pack.js', 'text/tables.js', 'a.js', 'b.js'])
      expect(packageLazy(pkg(id), info), id).toBe(true)
    for (const id of ['core/dom.ts', 'text/measure.mjs', 'veneer/Chart.tsx'])
      expect(packageLazy(pkg(id), info), id).toBe(false)
    expect(packageLazy('/app/entry.ts', info)).toBe(false)
    expect(packageLazy('/app/src/page.tsx', info)).toBe(false)
  })

  it('names the kit group only for what a page can bring', () => {
    const ctx = { getModuleInfo: info }
    const [icons, kit] = KIT_CHUNKS as { name: (id: string, c: typeof ctx) => string | null }[]
    expect(kit!.name(pkg('core/dom.ts'), ctx)).toBe('kit')
    expect(kit!.name(pkg('text/tables.js'), ctx)).toBeNull()
    expect(icons!.name(pkg('veneer/Chart.tsx'), ctx)).toBe('icons')
  })
})
