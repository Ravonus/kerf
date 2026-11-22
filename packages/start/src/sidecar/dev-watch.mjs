import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isServerModule } from '../vite.mjs'
import { buildable, crateDir, isNative, urlVariable } from './common.mjs'
import { watchFailure, watchTree } from '../watch-tree.mjs'

export async function watchServices(deps) {
  const {
    root,
    rust,
    contract,
    setContract,
    first,
    states,
    proxy,
    publish,
    rebuild,
    refresh,
    overlay,
    log,
  } = deps
  const watchers = []

  for (const service of buildable(contract(), rust)) {
    const dir = crateDir(root, rust, service)
    const s = {
      current: undefined,
      failure: existsSync(dir) ? undefined : `\`crates/${service}\` doesn't exist`,
      building: false,
    }
    states.set(service, s)
    if (!isNative(contract(), service)) {
      const p = await proxy(s)
      s.proxy = p
      process.env[urlVariable(service)] = `http://127.0.0.1:${p.port}`
    }
    if (!existsSync(dir)) {
      log(
        `[kerf] R109 error: ${s.failure}. Point \`rust.services.${service}.crate\` at it, or set \`external: true\``,
      )
      if (isNative(contract(), service)) publish()
      continue
    }
    if (!first.blocked) await rebuild(service)
    const changed = debounce(() => rebuild(service))
    const crate = watchCrate(dir, service, changed, log)
    if (crate) watchers.push(crate)
  }

  // A server module's edit may change a schema: the contract is regenerated, and only a change to a service's hash
  // rebuilds it. cargo then stops where the Rust no longer fits.
  const src = join(root, 'src')
  const contractChanged = debounce(async () => {
    try {
      const fresh = await refresh()
      if (fresh.blocked) return overlay(fresh.blocked.why)
      const before = contract()
      setContract(fresh.contract)
      for (const service of buildable(contract(), rust)) {
        if (
          states.has(service) &&
          before.services?.[service]?.hash !== contract().services[service].hash
        )
          void rebuild(service)
      }
    } catch (e) {
      log(`[kerf] the contract couldn't be regenerated: ${e.message.split('\n')[0]}`)
    }
  })
  const server = existsSync(src) ? watchServerModules(src, contractChanged, log) : null
  if (server) watchers.push(server)

  return watchers
}

const debounce = (fn, ms = 200) => {
  let t
  return () => {
    clearTimeout(t)
    t = setTimeout(() => fn(), ms)
  }
}

/** A crate's sources, for a rebuild on an edit; its `target` and lockfile are cargo's own writes. */
const watchCrate = (dir, service, changed, log) =>
  watchTree(
    dir,
    (_, file) => {
      if (file && !/^target([\\/]|$)/.test(file) && !file.endsWith('.lock')) changed()
    },
    (error) =>
      log(
        `[kerf] can't watch crates/${service} (${watchFailure(error)}): restart dev after an edit`,
      ),
  )

/** The app's server modules, whose edits may change the contract a service is built from. */
const watchServerModules = (src, changed, log) =>
  watchTree(
    src,
    (_, file) => {
      if (file && isServerModule(`src/${file.replaceAll('\\', '/')}`)) changed()
    },
    (error) =>
      log(
        `[kerf] can't watch src/ (${watchFailure(error)}): restart dev after a server module's schema changes`,
      ),
  )
