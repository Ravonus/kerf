/** Track group files that shape modules use without importing them into the client. */
export function shapeWatch(forget) {
  const byShape = new Map()
  const byFile = new Map()
  const key = (file) => file.replace(/\\/g, '/')
  const remove = (id) => {
    for (const old of byShape.get(id) ?? []) {
      const shapes = byFile.get(old)
      shapes?.delete(id)
      if (!shapes?.size) byFile.delete(old)
    }
    byShape.delete(id)
  }
  return {
    replace(id, dependencies, ctx) {
      remove(id)
      const files = new Set([...dependencies].map(key))
      byShape.set(id, files)
      for (const file of files) {
        if (!byFile.has(file)) byFile.set(file, new Set())
        byFile.get(file).add(id)
        ctx.addWatchFile(file)
      }
    },
    hotUpdate({ file, modules, type }) {
      if (type === 'delete') {
        for (const id of byShape.keys()) {
          if (key(id.replace(/\?weft-shape$/, '')) === key(file)) remove(id)
        }
      }
      const shapes = byFile.get(key(file))
      if (!shapes?.size) return
      forget(key(file))
      const graph = this.environment.moduleGraph
      const affected = []
      for (const id of shapes) {
        const mod = graph.getModuleById(id)
        if (!mod) continue
        graph.invalidateModule(mod)
        affected.push(mod)
      }
      if (affected.length) return [...new Set([...modules, ...affected])]
    },
  }
}
