// `weft check`: compile every project file in check mode, add the project view and the config P-codes.

import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { diagnostic, locate, positions, sortDiagnostics, summarize } from './diag.mjs'
import { discover } from './files.mjs'
import { loadConfig } from './load-config.mjs'
import { projectView } from './project.mjs'
import { loadCompiler, resolveWeft } from './weft.mjs'

const posix = p => p.split('\\').join('/')

/**
 * @param {string} root
 * @param {{ files?: string[] }} [options] files relative to `root` (or absolute); default: discovered
 */
export async function check(root, options = {}) {
  const started = performance.now()
  root = resolve(root)
  const weft = resolveWeft(root)
  const compiler = loadCompiler(weft)
  const loaded = await loadConfig(root)
  const { config } = loaded

  const rels = options.files?.length
    ? options.files.map(f => posix(relative(root, isAbsolute(f) ? f : join(root, f))))
    : discover(root, { include: config.check?.include, exclude: [...(config.check?.exclude ?? []), ...(config.scope?.forbid ?? [])] })

  const files = []
  const posByAbs = new Map()
  for (const rel of rels) {
    const abs = join(root, rel)
    const text = readFileSync(abs, 'utf8')
    const pos = positions(text)
    posByAbs.set(abs, pos)
    const out = compiler.transform(text, { filename: rel, checkOnly: true })
    const diagnostics = out.diagnostics.map(d => {
      const start = pos.fromByte(d.start)
      const end = pos.fromByte(d.end)
      const fix = d.fix && {
        description: d.fix.description,
        safe: d.fix.safe,
        edits: d.fix.edits.map(e => {
          const a = pos.fromByte(e.start)
          const b = pos.fromByte(e.end)
          return { file: rel, span: pos.span(a, b), offset: [a, b], text: e.text }
        }),
      }
      return diagnostic({ code: d.code, severity: d.severity, file: rel, span: pos.span(start, end), offset: [start, end], why: d.message, help: d.help, fix })
    })
    files.push({ abs, rel, text, diagnostics })
  }

  projectView(files, file => posByAbs.get(file.abs))

  const diagnostics = [...loaded.diagnostics, ...files.flatMap(f => f.diagnostics), ...hygiene(root)]
  sortDiagnostics(diagnostics)
  const summary = { files: files.length, ...summarize(diagnostics) }
  return {
    version: 1,
    ok: summary.errors === 0,
    root,
    weft: { version: weft.version, from: weft.from, compiler: weft.compilerPath },
    config: loaded.file ? posix(relative(root, loaded.file)) : null,
    summary,
    diagnostics,
    slots: loaded.slots,
    files: rels,
    ms: Math.round(performance.now() - started),
  }
}

/** P002 (`package.json` scripts that aren't `weft …`) and P120 (weft plugins wired straight into Vite). */
function hygiene(root) {
  const out = []
  const pkgFile = join(root, 'package.json')
  if (existsSync(pkgFile)) {
    const text = readFileSync(pkgFile, 'utf8')
    let scripts = {}
    try {
      scripts = JSON.parse(text).scripts ?? {}
    } catch {}
    for (const [name, cmd] of Object.entries(scripts)) {
      if (!/^weft(\s|$)/.test(cmd.trim())) {
        out.push(diagnostic({ code: 'P002', file: 'package.json', ...locate(text, `"${name}"`), why: `Script \`${name}\` runs \`${cmd}\`, not \`weft …\`: agents can't see what it does or what it touches.` }))
      }
    }
  }
  for (const name of ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']) {
    const file = join(root, name)
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/from\s+['"](@weft\/plugin-[\w-]+)/g)) {
      out.push(diagnostic({ code: 'P120', file: name, ...locate(text, m[1]), why: `\`${m[1]}\` is registered in ${name}, which bypasses weft.config.ts.` }))
    }
  }
  return out
}
