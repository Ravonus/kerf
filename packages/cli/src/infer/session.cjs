// One project's inference: a tsconfig's files, an engine, and a checker started only if something needs one. `weft
// check`, `weft tsc` and the dev worker all use this. The tsserver plugin has a language service of its own (plugin).

const { existsSync, readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { dirname, join } = require('node:path')
const { Engine } = require('./engine.cjs')
const { languageHost, tsgoHost } = require('./hosts.cjs')

/** The project's TypeScript when it can be driven without a plugin (7's API), else ours. */
function projectTypescript(root) {
  try {
    const pkg = createRequire(join(root, 'package.json')).resolve('typescript/package.json')
    const dir = dirname(pkg)
    if (existsSync(join(dir, 'dist/api/sync/api.js'))) return dir
  } catch {}
  return null
}

/** A language service over the project and an overlay: TypeScript before 7. */
function memoryHost(ts, root, config, parsed, overlay) {
  const versions = new Map()
  const host = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: (f) => String(versions.get(f) ?? 0),
    getScriptSnapshot(f) {
      const t = overlay.get(f) ?? (existsSync(f) ? readFileSync(f, 'utf8') : undefined)
      return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t)
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  }
  const service = ts.createLanguageService(host)
  const bump = (f) => versions.set(f, (versions.get(f) ?? 0) + 1)
  const out = languageHost(
    ts,
    () => service,
    (files, touched) => {
      for (const [f, t] of files) {
        overlay.set(f, t)
        bump(f)
      }
      touched.forEach(bump)
    },
  )
  out.allDiagnostics = () =>
    parsed.fileNames.flatMap((f) => out.diagnostics(f).map((d) => ({ ...d, file: f })))
  return out
}

class Session {
  constructor(ts, root, options = {}) {
    this.ts = ts
    this.root = root
    this.config = options.config ?? join(root, 'tsconfig.json')
    const raw = ts.readConfigFile(this.config, ts.sys.readFile)
    this.parsed = ts.parseJsonConfigFileContent(raw.config ?? {}, ts.sys, root)
    this.engine = new Engine({
      ts,
      read: (f) => (existsSync(f) ? readFileSync(f, 'utf8') : undefined),
      routes: options.routes,
    })
    this.host = null
    this.overlay = new Map()
    this.errors = new Map()
    for (const f of this.parsed.fileNames) if (f.endsWith('.tsx')) this.engine.set(f)
  }

  async start() {
    if (this.host) return this.host
    const dir = projectTypescript(this.root)
    this.host = dir
      ? await tsgoHost({
          root: this.root,
          config: this.config,
          typescriptDir: dir,
          overlay: this.overlay,
        })
      : memoryHost(this.ts, this.root, this.config, this.parsed, this.overlay)
    return this.host
  }

  /** Saved files: the checker reads them again, except where a shadow still stands in for them. */
  touch(files) {
    const plain = files.filter((f) => !this.engine.maps.has(f))
    for (const f of plain) this.overlay.delete(f)
    this.host.update(new Map(), plain)
  }

  /** Findings and the checker's errors in the files inference touches, in source positions. */
  async analyze(changed) {
    if (!this.engine.needed()) return { findings: new Map(), errors: new Map(), started: false }
    const fresh = !this.host
    const host = await this.start()
    const findings = this.engine.run(host, fresh ? undefined : changed)
    const redo = fresh || !changed ? this.engine.affected() : this.engine.touched
    for (const file of redo) {
      if (!this.engine.facts.has(file)) {
        this.errors.delete(file)
        continue
      }
      const list = this.engine.errors(host, file)
      if (list.length) this.errors.set(file, list)
      else this.errors.delete(file)
    }
    return { findings, errors: this.errors, started: true }
  }

  /** Every file's errors, the way `tsc --noEmit` would report them with inference applied. */
  async all() {
    const host = await this.start()
    const findings = this.engine.needed() ? this.engine.run(host) : new Map()
    const diags = host.allDiagnostics()
    const errors = new Map()
    const files = new Set(diags.map((d) => d.file))
    for (const file of files) {
      const real =
        [...this.engine.facts.keys()].find((f) => f.toLowerCase() === file.toLowerCase()) ?? file
      if (!this.engine.facts.has(real)) {
        errors.set(
          real,
          diags
            .filter((d) => d.file === file)
            .map((d) => ({
              code: `TS${d.code}`,
              start: d.start,
              end: d.start + d.length,
              why: d.text,
              help: 'Fix the type error',
            })),
        )
        continue
      }
      const list = this.engine.errors(host, real)
      if (list.length) errors.set(real, list)
    }
    return { findings, errors }
  }

  close() {
    this.host?.close()
    this.host = null
  }
}

module.exports = { Session, projectTypescript }
