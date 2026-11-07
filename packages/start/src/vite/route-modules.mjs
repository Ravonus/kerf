import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isCSSRequest } from 'vite'
import { here, ASSETS, SHEET } from './shared.mjs'
import { parse } from './syntax.mjs'
import { shapeOverride } from './shape-override.mjs'

/**
 * `dev`: the stylesheets from `devStyles`; a build asks Nitro's manifest instead (the plugin's expression reads up to
 * the first `)`, which a path can hold). `meta` is read once per level that renders, before the first byte: that's
 * how the entry learns the request's levels (`routeCss`), outermost first, 404 and error pages included.
 */
export function serverRoutes(manifest, abs, dev, plan) {
  const files = [
    ...manifest.layouts.map((l) => l.file),
    ...manifest.routes.map((r) => r.file),
    ...manifest.routes.map((r) => r.card).filter(Boolean),
    manifest.defaultCard,
  ].filter(Boolean)
  const unique = [...new Set(files)]
  const levels = new Set([...manifest.layouts, ...manifest.routes].map((r) => r.file))
  // A file with no default export renders nothing, and may leave no chunk for the manifest to find.
  const renders = (f) => levels.has(f) && /\bdefault\b/.test(readFileSync(abs(f), 'utf8'))
  const isStatic = (f) => plan?.statics.has(abs(f))
  const clientAssets = (file) =>
    `import.meta.vite.assets(${JSON.stringify({ import: file, environment: 'client' }).replaceAll(')', '\\u0029')})`
  const css = (f) =>
    dev
      ? JSON.stringify(dev.files[f] ?? [])
      : `${clientAssets(abs(f) + (isStatic(f) ? ASSETS : ''))}.css`
  return [
    ...unique.map((f, i) => `import * as m${i} from ${JSON.stringify(abs(f))}`),
    `import { runtime } from ${JSON.stringify(join(here, 'data.ts'))}`,
    `const matched = new WeakMap()
const styled = (m, css) => !css.length ? m : { ...m, get meta() {
  const scope = runtime.scope?.()
  if (scope) matched.set(scope, [...(matched.get(scope) ?? []), ...css])
  return m.meta
} }
export const routeCss = css => [...new Map([...${JSON.stringify(dev?.entry ?? [])}, ...css, ...(matched.get(runtime.scope?.()) ?? [])].map(c => [c.href, c])).values()]`,
    `export const manifest = ${JSON.stringify({ dir: manifest.dir, routes: manifest.routes, layouts: manifest.layouts, defaultCard: manifest.defaultCard })}`,
    // The built-in 404 and error pages have no state, and stand in only when the app has no route file for them.
    `export const statics = ${JSON.stringify(!plan ? [] : [...[...manifest.layouts, ...manifest.routes].filter((r) => isStatic(r.file)).map((r) => r.id), ...['404', 'error'].filter((id) => !manifest.routes.some((r) => r.id === id))])}`,
    `export const lazy = ${!!plan?.loads.some((l) => l.when !== 'load')}`,
    // The chunks a page's levels and islands will import, for the document's modulepreloads. Dev has no chunks.
    `export const chunks = ${dev ? '{}' : `{ ${[...[...manifest.layouts, ...manifest.routes].filter((r) => !isStatic(r.file) && renders(r.file)).map((r) => [r.id, abs(r.file)]), ...(plan?.islands ?? []).map((i) => [i.id, i.file]), ['$client', join(here, 'run.tsx')]].map(([id, file]) => `${JSON.stringify(id)}: ${clientAssets(file)}`).join(', ')} }`}`,
    `export const modules = { ${unique.map((f, i) => `${JSON.stringify(f)}: ${renders(f) ? `styled(m${i}, ${css(f)})` : `m${i}`}`).join(', ')} }`,
  ].join('\n')
}

/**
 * The CSS each module reaches in the client graph, as `?assets=client` can't say in dev: the entry's, and each route
 * and layout's. The client env transforms what the browser is about to ask for anyway, and `<link href>` to a module's
 * URL gets the compiled sheet (Tailwind's output too). A module that doesn't transform fails again when it's imported.
 */
export async function devStyles(env, manifest, abs, entry) {
  const reachFrom = async (start) => {
    const seen = new Set(),
      css = new Map()
    const walk = async (url) => {
      const mod =
        (await env.moduleGraph.getModuleByUrl(url).catch(() => undefined)) ??
        (await env.moduleGraph.ensureEntryFromUrl(url).catch(() => undefined))
      if (!mod || seen.has(mod) || mod.id?.startsWith('\0virtual:weft/routes')) return // routes import every route
      seen.add(mod)
      await env.transformRequest(mod.url).catch(() => {})
      for (const next of mod.importedModules) {
        if (!next.id) continue
        if (!isCSSRequest(next.id)) await walk(next.url)
        else if (!/[?&](url|inline|raw)\b/.test(next.id))
          css.set(next.url, {
            href: next.url[0] === '/' ? next.url : SHEET + encodeURIComponent(next.id),
          })
      }
    }
    await walk(start)
    return [...css.values()]
  }
  const files = {}
  for (const { file } of [...manifest.layouts, ...manifest.routes])
    files[file] = await reachFrom(abs(file))
  return {
    entry: await reachFrom(entry.startsWith('virtual:') ? join(here, 'client.tsx') : entry),
    files,
  }
}

/**
 * Vite's client, in dev: the fullstack plugin's patch hands a sheet to its `<link data-vite-dev-id>`, so the module
 * doesn't inject a second copy and CSS HMR swaps the link. The server only writes `href`, so the id is added here,
 * before the patched client reads the links.
 */
export const markLinks = (
  root,
) => `document.querySelectorAll('link[rel="stylesheet"]:not([data-vite-dev-id])').forEach(l => {
  const href = l.getAttribute('href')
  if (href.startsWith('${SHEET}')) l.setAttribute('data-vite-dev-id', decodeURIComponent(href.slice(${SHEET.length})))
  else if (href.startsWith('/@fs/')) l.setAttribute('data-vite-dev-id', href.replace(/^\\/@fs(\\/(?=[A-Za-z]:))?/, ''))
  else if (href[0] === '/' && href[1] !== '/') l.setAttribute('data-vite-dev-id', ${JSON.stringify(root)} + href)
})
`

/** Read a route or entry module only when its parsed syntax is valid. */
export function shapeBody(file) {
  const result = parse(file, readFileSync(file, 'utf8'))
  if (result.errors.length) {
    const message = result.errors[0]?.message ?? 'invalid source'
    throw new SyntaxError(`${file}: syntax error: ${message}`)
  }
  return result.program.body
}

/** Classify a route skeleton export without evaluating the route. */
export function skeletonExport(file) {
  const body = shapeBody(file)
  const constants = new Map()
  const bindings = (decl) => {
    if (decl?.type !== 'VariableDeclaration' || decl.kind !== 'const') return
    for (const item of decl.declarations) {
      if (item.id.type !== 'Identifier') continue
      let value = item.init
      while (
        value &&
        [
          'TSAsExpression',
          'TSSatisfiesExpression',
          'TSNonNullExpression',
          'TSTypeAssertion',
          'ParenthesizedExpression',
        ].includes(value.type)
      )
        value = value.expression
      constants.set(
        item.id.name,
        value?.value === false && (value.type === 'Literal' || value.type === 'BooleanLiteral'),
      )
    }
  }
  for (const node of body) bindings(node.declaration ?? node)
  let exported
  for (const node of body) {
    if (node.exportKind === 'type') continue
    if (node.type === 'ExportAllDeclaration') return 'unavailable'
    if (node.type !== 'ExportNamedDeclaration') continue
    const decl = node.declaration
    if (decl?.type === 'VariableDeclaration') {
      if (decl.declarations.some((item) => item.id.type !== 'Identifier')) return 'unavailable'
      if (decl.declarations.some((item) => item.id.name === 'skeleton'))
        exported = decl.kind === 'const' && constants.get('skeleton') ? 'disabled' : 'unavailable'
    } else if (decl?.id?.name === 'skeleton') exported = 'unavailable'
    for (const spec of node.specifiers ?? []) {
      if (spec.exportKind === 'type' || (spec.exported.name ?? spec.exported.value) !== 'skeleton')
        continue
      const local = spec.local.name ?? spec.local.value
      exported = !node.source && constants.get(local) ? 'disabled' : 'unavailable'
    }
  }
  return exported === 'unavailable' && shapeOverride(file) ? 'custom' : (exported ?? 'generated')
}

/** Whether a source specifier can name a non-module stylesheet or token sheet. */
export function shapeStyleSpecifier(spec) {
  return /(?<!\.module)\.css$/.test(spec) || /^weft:tokens\/[\w/-]+$/.test(spec)
}

// Inline CSS is data until a consumer applies it. Other dependencies remain unproven.
function styleImports(file) {
  return shapeBody(file)
    .filter((node) => node.type === 'ImportDeclaration' && !node.specifiers.length)
    .map((node) => node.source.value)
    .filter(shapeStyleSpecifier)
}

/** Resolve a stylesheet or token import without evaluating its importing module. */
export async function shapeCssSource(ctx, file, spec, onMissing) {
  if (!shapeStyleSpecifier(spec) || /^(https?:|\/\/)/.test(spec)) return
  if (!/^\.{1,2}\//.test(spec) && spec.includes('..')) return
  const found = await ctx.resolve(spec, file, { skipSelf: true })
  if (!found) onMissing?.()
  if (!found?.external && found?.id && isAbsolute(found.id) && found.id.endsWith('.css'))
    return found.id
}

/** Resolve only direct stylesheet and token imports, without evaluating their importing module. */
export async function shapeCssSources(ctx, file) {
  const styles = []
  for (const spec of styleImports(file)) {
    const style = await shapeCssSource(ctx, file, spec)
    if (style) styles.push(style)
  }
  return [...new Set(styles)]
}

/** The route facts embedded in the client shape manifest. */
export function shapeSignature(file) {
  const kind = skeletonExport(file)
  return JSON.stringify([kind, styleImports(file), kind === 'custom' ? shapeOverride(file) : null])
}

/**
 * The routes table's stylesheets and `shapeEntry`. A stylesheet edit in `weft dev` lands here instead of reloading the
 * page: a shape reads its CSS when it's shown.
 */
function shapeStyles(files) {
  const requests = files.map((file) => JSON.stringify(file + '?inline'))
  const accept = requests.length
    ? `if (import.meta.hot) import.meta.hot.accept([${requests.join(', ')}], (mods) => mods.forEach((m, i) => { if (m) styles[i] = m.default }))\n`
    : ''
  return `${requests.map((request, i) => `import style${i} from ${request}`).join('\n')}
const styles = [${requests.map((_, i) => `style${i}`).join(', ')}]
${accept}const shapeEntry = (module, sheets, name, kind) => {
  const component = Reflect.get(module, name)
  const groupCss = Reflect.get(module, '$weftShapeCss')
  const lead = typeof groupCss === 'string' && groupCss ? [groupCss] : []
  const thin = kind === 'generated' && Reflect.get(module, '$weftShapeThin') === true
  return typeof component === 'function'
    ? { kind, component, css: null, get cssText() { return [...lead, ...sheets.map((i) => styles[i])] }, cssStatus: 'partial', bytes: null, thin }
    : { kind: 'unavailable', reason: 'missing-shape', css: null, bytes: null }
}`
}

export function clientRoutes(manifest, abs, plan, css = {}) {
  const table = manifest.routes
    .filter((r) => r.kind === 'page')
    .map((r) => ({ id: r.id, pattern: r.pattern, layouts: r.layouts }))
  const levels = [...manifest.layouts, ...manifest.routes]
  const isStatic = (r) => plan?.statics.has(abs(r.file))
  const shapeFiles = new Map()
  const styleFiles = new Map()
  const shape = (
    file,
    name = 'default$shape',
    request = file + '?weft-shape',
    kind = 'generated',
  ) => {
    if (!shapeFiles.has(request)) shapeFiles.set(request, shapeFiles.size)
    const sources = [...(css.entry ?? []), ...(css.levels?.get(file) ?? [])]
    const styles = [...new Set(sources)].map((style) => {
      if (!styleFiles.has(style)) styleFiles.set(style, styleFiles.size)
      return styleFiles.get(style)
    })
    const args = [JSON.stringify(name), JSON.stringify(kind)].join(', ')
    return `shapeEntry(shape${shapeFiles.get(request)}, [${styles.join(', ')}], ${args})`
  }
  const shapes = levels.map((r) => {
    const file = abs(r.file)
    const classified = skeletonExport(file)
    const kind = classified === 'unavailable' && css.overrides?.has(file) ? 'custom' : classified
    const id = JSON.stringify(r.id)
    if (kind === 'disabled') return `${id}: { kind: 'disabled', css: null, bytes: null }`
    if (kind === 'unavailable')
      return `${id}: { kind: 'unavailable', reason: 'unresolved-export', css: null, bytes: null }`
    if (!/\.[jt]sx$/.test(file))
      return `${id}: { kind: 'unavailable', reason: 'unsupported-file', css: null, bytes: null }`
    if (kind === 'custom') {
      const request = `virtual:weft/shape-override/${encodeURIComponent(file)}.tsx`
      return `${id}: ${shape(file, 'default', request, 'override')}`
    }
    return `${id}: ${shape(file)}`
  })
  for (const [id, name] of [
    ['404', 'NotFoundPage$shape'],
    ['error', 'ErrorPage$shape'],
  ]) {
    if (!manifest.routes.some((route) => route.id === id))
      shapes.push(`${JSON.stringify(id)}: ${shape(join(here, 'builtin.tsx'), name)}`)
  }
  const shapeImports = [...shapeFiles].map(
    ([request, i]) => `import * as shape${i} from ${JSON.stringify(request)}`,
  )
  // A static route loads only what its module imports that isn't code: its stylesheets, for a navigation to it.
  const loads = levels.map(
    (r) =>
      `${JSON.stringify(r.id)}: () => import(${JSON.stringify(abs(r.file) + (isStatic(r) ? ASSETS : ''))})`,
  )
  // Straight from the file: a module of its own per island would be a chunk that only re-exports.
  const islands = (plan?.islands ?? []).map(
    (i) =>
      `${JSON.stringify(i.id)}: () => import(${JSON.stringify(i.file)}).then(({ $i${i.index}: d }) => ({ default: d }))`,
  )
  return `${shapeImports.join('\n')}
${shapeStyles([...styleFiles.keys()])}
export const shapes = { ${shapes.join(', ')} }
export const build = ${JSON.stringify(css.build ?? null)}
export const table = ${JSON.stringify(table)}
export const load = { ${loads.join(', ')} }
export const islands = { ${islands.join(', ')} }
`
}
