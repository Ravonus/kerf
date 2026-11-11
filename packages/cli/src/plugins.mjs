// Plugins (PLAN §7c, research 13 §2.6–2.8): run each plugin's pure `contribute()`, check what it declares, generate
// `.kerf/slots/<id>.ts` + `.kerf/slots.d.ts` + `.kerf/tokens/<ns>.css`, and serve `kerf plugins list|explain|sync`.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { loadConfig } from './load-config.mjs'
import { slotDef } from './slots.mjs'

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
const header =
  '// Generated from kerf.config.ts. Do not edit: change kerf.config.ts and run `kerf plugins sync`.'

const posix = (p) => p.split('\\').join('/')
const slotFile = (id) => `.kerf/slots/${id}.ts`

/** The ProviderRef a bound plugin declared for `slot` (and `key`). */
function providerRef(loaded, plugin, slot, key = '') {
  const c = loaded.contributions.find((x) => x.name === plugin)
  return c?.manifest.provides?.find((p) => p.slot.id === slot && (p.key ?? '') === key) ?? null
}

/** `module` relative to `.kerf/slots/` when the plugin gave a relative path from the project root. */
function specifier(root, module) {
  if (!module.startsWith('.') && !isAbsolute(module)) return module
  const abs = isAbsolute(module) ? module : resolve(root, module)
  const rel = posix(relative(join(root, '.kerf', 'slots'), abs))
  return rel.startsWith('.') ? rel : `./${rel}`
}

function loader(root, ref) {
  const side = ref.sides.client ?? ref.sides[Object.keys(ref.sides).sort()[0]]
  if (!side)
    return {
      comment: 'no sides',
      code: `() => Promise.reject(new Error('provider declares no module'))`,
    }
  const call =
    side.options === undefined
      ? `m[${JSON.stringify(side.export)}]`
      : `m[${JSON.stringify(side.export)}](${JSON.stringify(side.options)})`
  return {
    comment: Object.keys(ref.sides).sort().join(', '),
    code: `() => import(${JSON.stringify(specifier(root, side.module))}).then(m => ${call})`,
  }
}

const unbound = (id) =>
  `export const provider = null\nexport const load = (): never => {\n  throw Object.assign(new Error(${JSON.stringify(`P101 ${id}: nothing provides this slot. Add a plugin that provides it to \`plugins\` in kerf.config.ts.`)}), { code: 'P101' })\n}\n`
const builtin = (id, name) =>
  `export const provider = ${JSON.stringify(name)}\nexport const load = (): never => {\n  throw new Error(${JSON.stringify(`${id}: built in, provided by kerf (${name}).`)})\n}\n`

function addCssEntries(files, c) {
  const t = c.manifest.tokens
  if (t?.cssEntries === undefined) return
  if (!t.cssEntries || typeof t.cssEntries !== 'object' || Array.isArray(t.cssEntries))
    throw new TypeError('tokens.cssEntries must be an object')
  for (const [name, css] of Object.entries(t.cssEntries)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || typeof css !== 'string')
      throw new TypeError(`Invalid tokens.cssEntries entry: ${name}`)
    files[`.kerf/tokens/${t.namespace}.${name}.css`] =
      `/* Generated from kerf.config.ts (${c.name}). Do not edit. */\n${css}`
  }
}

/** File contents for every slot module, the slots.d.ts and token CSS, keyed by path relative to the root. */
export function generated(root, loaded) {
  const files = {}
  const typed = []
  for (const [id, binding] of Object.entries(loaded.slots).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const def = slotDef(id) ?? {
      version: 1,
      cardinality: typeof binding === 'object' && binding ? 'keyed' : 'one',
    }
    let body
    if (def.cardinality === 'one') {
      const ref =
        binding && !binding.startsWith('kerf:default') ? providerRef(loaded, binding, id) : null
      if (ref) {
        const l = loader(root, ref)
        const plugin = loaded.contributions.find((x) => x.name === binding)
        body = `// provider: ${binding}@${plugin.version} · implements ${id}@${ref.versions.join(',')} · sides: ${l.comment}\nexport const provider = ${JSON.stringify({ plugin: binding, version: plugin.version, interface: Math.max(...ref.versions) })} as const\nexport const load = ${l.code}\n`
        typed.push(id)
      } else if (binding?.startsWith('kerf:default')) body = builtin(id, binding)
      else body = unbound(id)
    } else {
      const lines = []
      const providers = {}
      for (const [key, name] of Object.entries(binding ?? {})) {
        const ref =
          name && !name.startsWith('kerf:default') ? providerRef(loaded, name, id, key) : null
        providers[key] = ref ? name : (name ?? null)
        if (ref) lines.push(`  ${JSON.stringify(key)}: ${loader(root, ref).code},`)
      }
      body = `export const providers = ${JSON.stringify(providers)} as const\nconst loaders: Record<string, () => Promise<unknown>> = {\n${lines.join('\n')}${lines.length ? '\n' : ''}}\nexport const load = (key: string): Promise<unknown> => {\n  const l = loaders[key]\n  if (l) return l()\n  throw Object.assign(new Error(\`P101 ${id} key \${key}: \${providers[key as keyof typeof providers] ? 'built in, provided by kerf' : 'nothing provides it'}.\`), { code: 'P101' })\n}\n`
      if (lines.length) typed.push(id)
    }
    files[slotFile(id)] = `${header}\n${body}`
  }
  // Build-side providers, for @kerf/core/vite to import in Node (it can't load the generated .ts): research 26 §3.1.
  for (const [id, binding] of Object.entries(loaded.slots)) {
    if (binding && typeof binding === 'object') {
      const keys = {}
      for (const [key, name] of Object.entries(binding)) {
        const side =
          name && !name.startsWith('kerf:default')
            ? providerRef(loaded, name, id, key)?.sides.build
            : null
        if (side)
          keys[key] = {
            plugin: name,
            module: side.module,
            export: side.export,
            options: side.options,
          }
      }
      if (Object.keys(keys).length)
        files[`.kerf/slots/${id}.build.json`] = `${JSON.stringify({ keys }, null, 2)}\n`
      continue
    }
    if (typeof binding !== 'string' || binding.startsWith('kerf:default')) continue
    const side = providerRef(loaded, binding, id)?.sides.build
    if (!side) continue
    const plugin = loaded.contributions.find((x) => x.name === binding)
    const module = side.module.startsWith('.') ? posix(resolve(root, side.module)) : side.module
    files[`.kerf/slots/${id}.build.json`] =
      `${JSON.stringify({ plugin: binding, version: plugin.version, module, export: side.export, ...(side.options === undefined ? {} : { options: side.options }) }, null, 2)}\n`
  }
  files['.kerf/slots.d.ts'] =
    `${header}\n// Only bound slots are declared: importing an unbound one is a type error (P101).\n${typed
      .map(
        (id) =>
          `declare module 'kerf:slot/${id}' {\n  export const provider: unknown\n  export const providers: Record<string, unknown>\n  export const load: (key?: string) => Promise<any>\n}\n`,
      )
      .join('')}`
  for (const c of loaded.contributions) {
    const t = c.manifest.tokens
    if (t?.css)
      files[`.kerf/tokens/${t.namespace}.css`] =
        `/* Generated from kerf.config.ts (${c.name}). Do not edit. */\n${t.css}`
    addCssEntries(files, c)
    if (t?.alias)
      files[`.kerf/tokens/${t.namespace}.alias.json`] = `${JSON.stringify(t.alias, null, 2)}\n`
  }
  return files
}

/** Write generated files whose content changed; remove stale slot/token files. Returns written paths. */
export function sync(root, loaded) {
  const files = generated(root, loaded)
  const written = []
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(root, rel)
    if (existsSync(abs) && readFileSync(abs, 'utf8') === text) continue
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, text)
    written.push(rel)
  }
  for (const dir of ['.kerf/slots', '.kerf/tokens']) {
    if (!existsSync(join(root, dir))) continue
    for (const f of readdirSync(join(root, dir))) {
      if (!(`${dir}/${f}` in files)) rmSync(join(root, dir, f))
    }
  }
  return written
}

/** `kerf plugins list --json`. */
export async function list(root) {
  root = resolve(root)
  const loaded = await loadConfig(root)
  const unique = (loaded.config.plugins ?? []).filter(
    (p, i, all) => all.findIndex((q) => q.name === p.name) === i,
  )
  const plugins = [...unique].sort(byName).map((p) => {
    const c = loaded.contributions.find((x) => x.name === p.name)
    const provides = (p.provides ?? []).map((item) => {
      const { slot, key } = typeof item === 'string' ? { slot: item } : item
      const binding = loaded.slots[slot]
      const bound = key ? binding?.[key] === p.name : binding === p.name
      return {
        slot,
        ...(key ? { key } : {}),
        interface: providerRef(loaded, p.name, slot, key)?.versions ?? null,
        bound,
      }
    })
    return {
      name: p.name,
      version: p.version ?? null,
      provides,
      permissions: c?.permissions ?? {},
      namespace: c?.namespace ?? null,
      diagnostics: (c?.manifest.diagnostics ?? []).map((d) => d.code),
      tokens: c?.manifest.tokens?.namespace ?? null,
      catalog: (c?.manifest.catalog ?? []).map((e) => e.name),
      agents: c?.manifest.agents?.title ?? null,
    }
  })
  return {
    ok: !loaded.diagnostics.some((d) => d.severity === 'error'),
    plugins,
    slots: loaded.slots,
    diagnostics: loaded.diagnostics,
  }
}

/** `kerf plugins explain <slot> --json`: config entry → plugin → module → generated file. */
export async function explain(root, id) {
  root = resolve(root)
  const loaded = await loadConfig(root)
  if (!id || !(id in loaded.slots))
    throw Object.assign(
      new Error(`unknown slot ${id ?? '(none)'}; known: ${Object.keys(loaded.slots).join(', ')}`),
      { code: 'E_USAGE' },
    )
  const binding = loaded.slots[id]
  const def = slotDef(id) ?? null
  const chain = (key) => {
    const name = key === undefined ? binding : binding?.[key]
    if (!name) return { provider: null, why: 'nothing provides it (P101 for consumers)' }
    if (name.startsWith('kerf:default'))
      return { provider: name, why: 'built in, provided by kerf' }
    const ref = providerRef(loaded, name, id, key ?? '')
    const side = ref && (ref.sides.client ?? ref.sides[Object.keys(ref.sides).sort()[0]])
    return {
      config: loaded.file ? posix(relative(root, loaded.file)) : null,
      chosenBy: loaded.config.slots?.[id] ? 'slots' : 'only provider',
      plugin: name,
      version: loaded.contributions.find((c) => c.name === name)?.version ?? null,
      interface: ref?.versions ?? null,
      sides: ref ? Object.keys(ref.sides).sort() : [],
      module: side
        ? {
            module: side.module,
            export: side.export,
            ...(side.options === undefined ? {} : { options: side.options }),
          }
        : null,
    }
  }
  const bindings =
    def?.cardinality === 'keyed' || (binding && typeof binding === 'object')
      ? Object.fromEntries(
          Object.keys(binding ?? {})
            .sort()
            .map((k) => [k, chain(k)]),
        )
      : chain()
  return {
    slot: id,
    version: def?.version ?? null,
    cardinality: def?.cardinality ?? 'one',
    sides: def?.sides ?? [],
    binding: bindings,
    file: slotFile(id),
    import: `kerf:slot/${id}`,
  }
}
