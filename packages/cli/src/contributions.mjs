// What each plugin's `contribute()` returned, checked against the limits. Apart from plugins.mjs because loading a config needs it and the plugin commands load configs.

export const agentsLimit = 1024
/** Rows a plugin may add to the agent map. */
const mapLimit = 5
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** JSON with sorted keys and functions named, so two runs of a pure `contribute()` compare equal. */
function stable(value) {
  return JSON.stringify(value, (_, v) => {
    if (typeof v === 'function') return `[function ${v.name}]`
    if (v && typeof v === 'object' && !Array.isArray(v))
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, v[k]]),
      )
    return v
  })
}

/**
 * Run `contribute()` for every plugin instance that has one (data-only entries are skipped), in name order.
 * @param {object[]} plugins unique entries from `plugins`
 * @param {(code: string, why: string, near: string, extra?: object) => void} report
 * @param {{ root: string, command?: string }} env
 * @returns {{ name: string, version?: string, namespace?: string, permissions?: object, manifest: object }[]}
 */
export function contributions(plugins, report, env) {
  const out = []
  const tokenOwner = new Map()
  const catalogOwner = new Map()
  for (const p of [...plugins].sort(byName)) {
    if (typeof p.contribute !== 'function') continue
    const run = () =>
      p.contribute({ command: env.command ?? 'check', mode: 'development', root: env.root })
    let manifest
    try {
      manifest = run()
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'P007'
      report(code, `\`${p.name}\`: ${String(error?.message ?? error).split('\n')[0]}`, p.name, {
        owner: code === 'P007' ? 'core' : p.name,
        help: error?.help,
      })
      continue
    }
    let again
    try {
      again = run()
    } catch {}
    if (!again || stable(again) !== stable(manifest))
      report(
        'P117',
        `\`${p.name}\`'s contribute() returned a different manifest on a second call.`,
        p.name,
      )

    const ns = checkManifest(p, manifest, report, tokenOwner, catalogOwner)
    out.push({
      name: p.name,
      version: p.version,
      namespace: ns,
      permissions: p.permissions ?? {},
      manifest,
    })
  }
  return out
}

function checkManifest(p, manifest, report, tokenOwner, catalogOwner) {
  const ns = p.namespace ?? `${p.name.replace(/^@[^/]+\//, '').replace(/^plugin-/, '')}/`
  for (const d of manifest.diagnostics ?? []) {
    if (!d.code.startsWith(ns))
      report(
        'P111',
        `\`${p.name}\` declares \`${d.code}\`, outside its namespace \`${ns}\`.`,
        p.name,
      )
  }
  const agents = manifest.agents
  if (agents) {
    const bytes = Buffer.byteLength(agentsSection(agents))
    if (bytes > agentsLimit)
      report(
        'P112',
        `\`${p.name}\`'s AGENTS section is ${bytes} bytes (limit ${agentsLimit}).`,
        p.name,
      )
  }
  if ((manifest.map?.length ?? 0) > mapLimit)
    report(
      'P112',
      `\`${p.name}\` adds ${manifest.map.length} map rows (limit ${mapLimit}).`,
      p.name,
    )
  const tns = manifest.tokens?.namespace
  if (tns) {
    if (tokenOwner.has(tns))
      report(
        'P113',
        `Token namespace \`${tns}\` is contributed by both \`${tokenOwner.get(tns)}\` and \`${p.name}\`.`,
        p.name,
      )
    else tokenOwner.set(tns, p.name)
  }
  for (const c of manifest.catalog ?? []) {
    if (catalogOwner.has(c.name))
      report(
        'P113',
        `Catalog entry \`${c.name}\` is contributed by both \`${catalogOwner.get(c.name)}\` and \`${p.name}\`.`,
        p.name,
      )
    else catalogOwner.set(c.name, p.name)
  }
  return ns
}

export const agentsSection = (agents) => `### ${agents.title}\n\n${agents.text.trim()}\n`
