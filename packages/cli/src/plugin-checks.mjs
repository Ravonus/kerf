// Plugin `check` hooks (research 13 §2.3 `CheckHook`, research 26 §2.5): a plugin's manifest may carry
// `check: { include: string[], run(ctx) }`. `weft check` runs it once over the matching files, never on HMR. The
// hook reads through `ctx` (the files, a JSX view, other project files) and returns diagnostics in its namespace.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { entry } from './catalog.mjs'
import { diagnostic, positions } from './diag.mjs'
import { discover, matcher } from './files.mjs'
import { importOf, scanJsx } from './jsx-scan.mjs'

/**
 * @param {string} root
 * @param {{ contributions: { name: string, namespace: string, manifest: any }[] }} loaded
 * @param {{ files: { rel: string, text: string }[], exclude?: string[] }} options the files `weft check` compiled
 */
export async function pluginChecks(root, loaded, { files, exclude = [] }) {
  const out = []
  const texts = new Map(files.map(f => [f.rel, f.text]))
  const read = rel => {
    if (!texts.has(rel)) texts.set(rel, existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : '')
    return texts.get(rel)
  }
  const scans = new Map()
  const jsx = rel => {
    if (!scans.has(rel)) {
      try {
        scans.set(rel, scanJsx(read(rel), rel))
      } catch {
        scans.set(rel, { imports: [], elements: [], functions: new Map() })
      }
    }
    return scans.get(rel)
  }

  for (const c of loaded.contributions) {
    const hook = c.manifest.check
    if (!hook || typeof hook.run !== 'function') continue
    const include = hook.include ?? ['**/*.{tsx,jsx}']
    const wanted = matcher(include)
    /** @type {Set<string>} */
    const chosen = new Set([...files.map(f => f.rel).filter(wanted), ...discover(root, { include, exclude })])
    const rels = [...chosen].sort()
    const declared = new Map((c.manifest.diagnostics ?? []).map(d => [d.code, d]))
    const ctx = Object.freeze({
      root,
      files: rels,
      read,
      jsx,
      importOf,
      slots: loaded.slots ?? {},
      exists: rel => existsSync(join(root, rel)),
      bytes: rel => (existsSync(join(root, rel)) ? new Uint8Array(readFileSync(join(root, rel))) : undefined),
    })
    let found
    try {
      found = (await hook.run(ctx)) ?? []
    } catch (error) {
      out.push(diagnostic({ code: 'P119', owner: c.name, file: 'weft.config.ts', why: `\`${c.name}\`'s check hook threw: ${String(error?.message ?? error).split('\n')[0]}` }))
      continue
    }
    for (const d of found) {
      if (!d.code.startsWith(c.namespace)) {
        out.push(diagnostic({ code: 'P111', file: 'weft.config.ts', why: `\`${c.name}\`'s check reported \`${d.code}\`, outside its namespace \`${c.namespace}\`.` }))
        continue
      }
      const text = read(d.file)
      const pos = positions(text)
      const [start, end] = [d.start ?? 0, d.end ?? d.start ?? 0]
      const meta = declared.get(d.code)
      out.push(diagnostic({
        code: d.code,
        owner: c.name,
        severity: d.severity ?? meta?.severity ?? 'error',
        file: d.file,
        span: pos.span(start, end),
        offset: [start, end],
        why: d.why,
        help: d.help ?? (entry(d.code) ? undefined : meta?.fix), // a catalog code keeps the catalog's fix text
        fix: d.fix && {
          description: d.fix.description,
          safe: d.fix.safe === true,
          edits: d.fix.edits.map(e => ({ file: e.file ?? d.file, span: positions(read(e.file ?? d.file)).span(e.start, e.end), offset: [e.start, e.end], text: e.text })),
        },
      }))
    }
  }
  return out
}
