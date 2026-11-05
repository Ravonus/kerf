const { Engine } = require('../src/infer/engine.cjs')
const { languageHost } = require('../src/infer/hosts.cjs')

function createContext(ts, info, ls) {
  const lsHost = info.languageServiceHost
  const realSnapshot = lsHost.getScriptSnapshot.bind(lsHost)
  const realVersion = lsHost.getScriptVersion.bind(lsHost)
  const textOf = (f) => {
    const s = realSnapshot(f)
    return s && s.getText(0, s.getLength())
  }
  const engine = new Engine({ ts, read: textOf })
  const gen = new Map()
  const seen = new Map()
  const sources = new Map()

  lsHost.getScriptSnapshot = (f) => {
    const m = engine.maps.get(f)
    return m ? ts.ScriptSnapshot.fromString(m.text) : realSnapshot(f)
  }
  lsHost.getScriptVersion = (f) => `${realVersion(f)}.${gen.get(f) ?? 0}`
  // tsserver only syncs a dirty project, so a new shadow has to dirty it.
  const host = languageHost(
    ts,
    () => ls,
    (files) => {
      for (const f of files.keys()) gen.set(f, (gen.get(f) ?? 0) + 1)
      info.project.markAsDirty()
    },
  )

  let busy = false
  function ensure() {
    if (busy) return
    let changed = false
    for (const f of lsHost.getScriptFileNames()) {
      if (!f.endsWith('.tsx')) continue
      const v = realVersion(f)
      if (seen.get(f) === v) continue
      seen.set(f, v)
      if (engine.set(f, textOf(f))) changed = true
    }
    if (!changed) return
    busy = true
    try {
      engine.run(host)
    } catch (e) {
      info.project.projectService.logger.info(`weft props: ${e.stack}`)
    } finally {
      busy = false
    }
  }

  return { engine, textOf, ensure, sources }
}

module.exports = { createContext }
