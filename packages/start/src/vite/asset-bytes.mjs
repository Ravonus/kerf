// A closure names emitted files, so callers can union routes without counting a shared file twice.
function closure(bundle, roots) {
  const seen = new Set()
  let complete = true
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const item = bundle[file]
    if (item?.type !== 'chunk') return
    if (!Array.isArray(item.imports) || !item.viteMetadata?.importedCss ||
        !item.viteMetadata?.importedAssets) complete = false
    for (const dep of item.imports ?? []) visit(dep)
    for (const dep of item.viteMetadata?.importedCss ?? []) visit(dep)
    for (const dep of item.viteMetadata?.importedAssets ?? []) visit(dep)
  }
  for (const file of roots) visit(file)
  return { files: [...seen].sort(), complete }
}

function chunkFor(bundle, ids) {
  const matches = Object.entries(bundle).filter(([, item]) => item.type === 'chunk' &&
    ids.some((id) => item.facadeModuleId === id || Object.hasOwn(item.modules ?? {}, id)))
  return matches.length === 1 ? matches[0][0] : undefined
}

/** Byte lengths of emitted static closures. Dynamic and external dependencies are not inferred. */
export function assetBytes(bundle, read, manifest, abs) {
  const routes = Object.fromEntries([...manifest.layouts, ...manifest.routes].map((route) => {
    const file = abs(route.file)
    const root = chunkFor(bundle, [file, `${file}?weft-assets`])
    return [route.id, root ? closure(bundle, [root]) : null]
  }))
  const eagerRoot = chunkFor(bundle, ['\0virtual:weft/routes'])
  const eager = eagerRoot ? closure(bundle, [eagerRoot]) : null
  const owners = new Map()
  for (const entry of [...Object.values(routes), eager]) {
    for (const file of entry?.files ?? []) owners.set(file, (owners.get(file) ?? 0) + 1)
  }
  const shared = [...owners].filter(([, count]) => count > 1).map(([file]) => file).sort()
  const sharedSet = new Set(shared)
  const files = Object.fromEntries([...owners.keys()].sort().map((file) => {
    const item = bundle[file]
    let bytes = null
    if (item) {
      try { bytes = read(file).length } catch { /* not emitted or not readable */ }
    }
    const kind = !item ? 'unknown' : item.type === 'chunk' ? 'js' :
      file.endsWith('.css') ? 'css' : 'asset'
    return [file, { bytes, kind }]
  }))
  const size = (items) => items.some((file) => files[file].bytes === null)
    ? null : items.reduce((sum, file) => sum + files[file].bytes, 0)
  const describe = (entry) => entry && ({
    files: entry.files,
    bytes: entry.complete ? size(entry.files) : null,
    uniqueBytes: entry.complete ? size(entry.files.filter((file) => !sharedSet.has(file))) : null,
    sharedBytes: entry.complete ? size(entry.files.filter((file) => sharedSet.has(file))) : null,
  })
  return { version: 1, scope: 'vite-static-closure', files, shared, routes: Object.fromEntries(
    Object.entries(routes).map(([id, items]) => [id, describe(items)]),
  ), eager: describe(eager) }
}
