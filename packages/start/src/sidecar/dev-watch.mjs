import { existsSync, watch } from 'node:fs'
import { join } from 'node:path'
import { isServerModule } from '../vite.mjs'
import { buildable, crateDir, isNative, urlVariable } from './common.mjs'

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
        `[weft] R109 error: ${s.failure}. Point \`rust.services.${service}.crate\` at it, or set \`external: true\``,
      )
      if (isNative(contract(), service)) publish()
      continue
    }
    if (!first.blocked) await rebuild(service)
    const changed = debounce(() => rebuild(service))
    watchers.push(
      watch(dir, { recursive: true }, (_, file) => {
        if (file && !/^target([\\/]|$)/.test(file) && !file.endsWith('.lock')) changed()
      }),
    )
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
      log(`[weft] the contract couldn't be regenerated: ${e.message.split('\n')[0]}`)
    }
  })
  if (existsSync(src))
    watchers.push(
      watch(src, { recursive: true }, (_, file) => {
        if (file && isServerModule(`src/${file.replaceAll('\\', '/')}`)) contractChanged()
      }),
    )

  return watchers
}

const debounce = (fn, ms = 200) => {
  let t
  return () => {
    clearTimeout(t)
    t = setTimeout(() => fn(), ms)
  }
}
