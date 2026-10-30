// `weft add` (research 34 §7): one insert into any config format, and no change at all when it can't be sure.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addCommand } from '../src/add.mjs'
import { loadConfig } from '../src/load-config.mjs'
import { project } from './helpers.mjs'

const plugin = "import { definePlugin } from 'weft/plugin'\nexport default definePlugin({ name: 'acme', options: o => o ?? {}, contribute: () => ({}) })\n"
const acme = { 'node_modules/acme/package.json': JSON.stringify({ name: 'acme', type: 'module', exports: { './plugin': './plugin.mjs' } }), 'node_modules/acme/plugin.mjs': plugin }
const add = (dir, name = 'acme') => addCommand(dir, name, { install: false })
const read = (dir, file) => readFileSync(join(dir, file), 'utf8')
const names = async dir => (await loadConfig(dir)).config.plugins?.map(p => p.name)

describe('weft add', () => {
  it.each([
    ['an existing plugins array', "import { defineConfig } from 'weft/config'\n\nexport default defineConfig({\n  plugins: [],\n})\n"],
    ['no plugins key', "export default {\n  site: { name: 'A' },\n}\n"],
    ['an empty config', 'export default {}\n'],
  ])('edits weft.config.ts with %s', async (_, text) => {
    const dir = project({ ...acme, 'weft.config.ts': text })
    await add(dir)
    expect(await names(dir)).toEqual(['acme'])
    expect(read(dir, 'weft.config.ts')).toContain("import acme from 'acme/plugin'")
  })

  it('writes a named import for a package without a default export', async () => {
    const named = plugin.replace('export default definePlugin', 'export const acme = definePlugin')
    const dir = project({ ...acme, 'node_modules/acme/plugin.mjs': named, 'weft.config.ts': 'export default {}\n' })
    await add(dir)
    expect(read(dir, 'weft.config.ts')).toContain("import { acme } from 'acme/plugin'")
    expect(await names(dir)).toEqual(['acme'])
  })

  it('appends to a list, keeping what is there', async () => {
    const dir = project({ ...acme, 'weft.config.yaml': '# ours\nsite: { name: A }\n' })
    await add(dir)
    expect(read(dir, 'weft.config.yaml')).toContain('# ours')
    expect(await names(dir)).toEqual(['acme'])
  })

  it('edits weft.config.json', async () => {
    const dir = project({ ...acme, 'weft.config.json': '{ "site": { "name": "A" } }' })
    await add(dir)
    expect(await names(dir)).toEqual(['acme'])
  })

  it('is safe to run twice', async () => {
    const dir = project({ ...acme, 'weft.config.ts': 'export default {}\n' })
    await add(dir)
    const text = read(dir, 'weft.config.ts')
    expect(await add(dir)).toMatchObject({ already: true })
    expect(read(dir, 'weft.config.ts')).toBe(text)
  })

  it('--dry-run changes nothing', async () => {
    const dir = project({ ...acme, 'weft.config.ts': 'export default {}\n' })
    expect((await addCommand(dir, 'acme', { dryRun: true })).actions).toEqual(['install acme with npm', 'add acme to weft.config.ts'])
    expect(read(dir, 'weft.config.ts')).toBe('export default {}\n')
  })

  it('stops at a config it cannot read, and puts back one that stops loading', async () => {
    const computed = "const plugins = []\nexport default { plugins }\n"
    const a = project({ ...acme, 'weft.config.ts': computed })
    await expect(add(a)).rejects.toThrow('by hand')
    expect(read(a, 'weft.config.ts')).toBe(computed)
    const b = project({ 'weft.config.yaml': 'site: { name: A }\n' })
    await expect(add(b, 'ghost')).rejects.toThrow('back as it was')
    expect(read(b, 'weft.config.yaml')).toBe('site: { name: A }\n')
  })

  it('names features that are not built yet, and changes nothing', async () => {
    const dir = project({ 'weft.config.ts': 'export default {}\n' })
    await expect(add(dir, 'db')).rejects.toThrow("isn't built yet")
    await expect(add(dir, 'tailwind')).rejects.toThrow("isn't built yet")
  })
})
