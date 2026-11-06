import { existsSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

const key = (file) => file.replace(/\\/g, '/')

function remove({ byShape, byFile }, id) {
  for (const old of byShape.get(id) ?? []) {
    const shapes = byFile.get(old)
    shapes?.delete(id)
    if (!shapes?.size) byFile.delete(old)
  }
  byShape.delete(id)
}

/** Track group files that shape modules use without importing them into the client. */
export function shapeWatch(forget) {
  let environments = new WeakMap()
  let activeServer
  let watcher
  const stateFor = (environment) => {
    let state = environments.get(environment)
    if (!state) {
      state = { byShape: new Map(), byFile: new Map() }
      environments.set(environment, state)
    }
    return state
  }
  return {
    attach(server) {
      if (activeServer === server) return
      environments = new WeakMap()
      activeServer = server
      watcher = server.watcher
      if (typeof server.close !== 'function') return
      const close = server.close
      server.close = async function (...args) {
        try {
          return await close.apply(this, args)
        } finally {
          if (activeServer === server) {
            environments = new WeakMap()
            activeServer = undefined
            watcher = undefined
          }
        }
      }
    },
    candidate(file, dependencies) {
      dependencies.add(key(file))
    },
    replace(id, dependencies, ctx) {
      const state = stateFor(ctx.environment)
      const { byShape, byFile } = state
      remove(state, id)
      const files = new Set([...dependencies].map(key))
      byShape.set(id, files)
      for (const file of files) {
        if (!byFile.has(file)) byFile.set(file, new Set())
        byFile.get(file).add(id)
        if (statSync(file, { throwIfNoEntry: false })?.isFile()) ctx.addWatchFile(file)
        else if (watcher) {
          let dir = dirname(file)
          while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir)
          watcher.add(dir)
        }
      }
    },
    hotUpdate({ file, modules, type }) {
      const state = environments.get(this.environment)
      if (!state) return
      const { byShape, byFile } = state
      if (type === 'delete') {
        for (const id of byShape.keys()) {
          if (key(id.replace(/\?weft-shape$/, '')) === key(file)) remove(state, id)
        }
      }
      const path = key(file)
      const stem = path.replace(/\.[cm]?[jt]sx?$/, '')
      const candidates = [path, stem]
      if (stem.endsWith('/index')) candidates.push(stem.slice(0, -'/index'.length))
      const shapes = new Set(candidates.flatMap((name) => [...(byFile.get(name) ?? [])]))
      if (!shapes.size) return
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
