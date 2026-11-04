// A tsserver plugin: the editor's language service sees each file's shadow, and every position in and out is mapped, so
// inferred props hover, complete and report at the source. TypeScript 7 doesn't load plugins and ignores the entry in
// tsconfig without a word, which is safe: research 44 §6 says what an editor on tsgo gets instead.

const { Engine } = require('../src/infer/engine.cjs')
const { languageHost } = require('../src/infer/hosts.cjs')
const { toShadow, toSource, inGenerated } = require('../src/infer/shadow.cjs')

const CODES = { W080: 9080, W081: 9081, W082: 9082, W083: 9083, W084: 9084, W085: 9085 }
const SPANS = new Set([
  'textSpan',
  'contextSpan',
  'triggerSpan',
  'applicableSpan',
  'applicableToSpan',
  'optionalReplacementSpan',
  'replacementSpan',
  'fileTextChangesSpan',
  'span',
])

function init({ typescript: ts }) {
  function create(info) {
    const ls = info.languageService
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

    const mapOf = (f) => engine.maps.get(f)
    const sourceFile = (f) => {
      const text = engine.texts.get(f) ?? textOf(f)
      const hit = sources.get(f)
      if (hit?.text === text) return hit.sf
      const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      sources.set(f, { text, sf })
      return sf
    }
    const spanBack = (map, s) => {
      const start = toSource(map, s.start)
      return { start, length: toSource(map, s.start + s.length) - start }
    }
    /** Walks a result and maps every span, using the nearest `fileName` above it. */
    function back(value, file) {
      if (Array.isArray(value)) return value.map((v) => back(v, file))
      if (!value || typeof value !== 'object') return value
      const here = typeof value.fileName === 'string' ? value.fileName : file
      const map = mapOf(here)
      const out = {}
      for (const k of Object.keys(value)) {
        const v = value[k]
        if (SPANS.has(k) && map && v && typeof v.start === 'number') out[k] = spanBack(map, v)
        else if (k === 'symbol' || k === 'file' || typeof v === 'function') out[k] = v
        else out[k] = back(v, here)
      }
      return out
    }
    const diag = (d, f) => {
      const file = d.file?.fileName ?? f
      const map = mapOf(file)
      if (!map || d.start === undefined) return d
      const related = d.relatedInformation?.map((r) => diag(r, f))
      const start = toSource(map, d.start)
      return {
        ...d,
        file: sourceFile(file),
        start,
        length: toSource(map, d.start + d.length) - start,
        relatedInformation: related,
      }
    }
    const inside = (d, f) => {
      const m = mapOf(f)
      return !(m && d.start !== undefined && inGenerated(m, d.start, d.length ?? 0))
    }
    const findings = (f) => engine.findings.get(f) ?? []
    const said = (f) => findings(f).filter((x) => x.code === 'W084')

    const proxy = Object.create(null)
    for (const k of Object.keys(ls)) proxy[k] = (...a) => ls[k](...a)
    const at = (name, index = 1) => {
      proxy[name] = (f, ...rest) => {
        ensure()
        const map = mapOf(f)
        const args = [f, ...rest]
        if (map) args[index] = toShadow(map, args[index])
        return back(ls[name](...args), f)
      }
    }
    for (const n of [
      'getQuickInfoAtPosition',
      'getCompletionsAtPosition',
      'getCompletionEntryDetails',
      'getDefinitionAtPosition',
      'getDefinitionAndBoundSpan',
      'getTypeDefinitionAtPosition',
      'getImplementationAtPosition',
      'getReferencesAtPosition',
      'findReferences',
      'getSignatureHelpItems',
      'getRenameInfo',
      'getDocumentHighlights',
      'prepareCallHierarchy',
      'getBraceMatchingAtPosition',
    ])
      if (ls[n]) at(n)
    proxy.findRenameLocations = (f, pos, ...rest) => {
      ensure()
      const m = mapOf(f)
      return back(ls.findRenameLocations(f, m ? toShadow(m, pos) : pos, ...rest), f)
    }
    proxy.getSyntacticDiagnostics = (f) => {
      ensure()
      return ls
        .getSyntacticDiagnostics(f)
        .filter((d) => inside(d, f))
        .map((d) => diag(d, f))
    }
    proxy.getSuggestionDiagnostics = (f) => {
      ensure()
      return ls
        .getSuggestionDiagnostics(f)
        .filter((d) => inside(d, f))
        .map((d) => diag(d, f))
    }
    proxy.getSemanticDiagnostics = (f) => {
      ensure()
      const sf = mapOf(f) ? sourceFile(f) : ls.getProgram()?.getSourceFile(f)
      const ours = findings(f).map((x) => ({
        file: sf,
        start: x.start,
        length: x.end - x.start,
        messageText: `${x.code} ${x.why} Fix: ${x.help}`,
        category:
          x.severity === 'warning' ? ts.DiagnosticCategory.Warning : ts.DiagnosticCategory.Error,
        code: CODES[x.code],
        source: 'weft',
      }))
      const theirs = ls
        .getSemanticDiagnostics(f)
        .filter((d) => inside(d, f))
        .map((d) => diag(d, f))
        .filter(
          (d) => !said(f).some((x) => d.start < x.end && x.start < d.start + Math.max(d.length, 1)),
        )
      return [...theirs, ...ours]
    }
    proxy.getEncodedSemanticClassifications = (f, span, format) => {
      ensure()
      const m = mapOf(f)
      if (!m) return ls.getEncodedSemanticClassifications(f, span, format)
      const start = toShadow(m, span.start)
      const out = ls.getEncodedSemanticClassifications(
        f,
        { start, length: toShadow(m, span.start + span.length) - start },
        format,
      )
      const spans = []
      for (let i = 0; i < out.spans.length; i += 3) {
        if (inGenerated(m, out.spans[i], out.spans[i + 1])) continue
        const s = toSource(m, out.spans[i])
        spans.push(s, toSource(m, out.spans[i] + out.spans[i + 1]) - s, out.spans[i + 2])
      }
      return { ...out, spans }
    }
    proxy.getCodeFixesAtPosition = (f, start, end, codes, ...rest) => {
      ensure()
      const fixes = findings(f)
        .filter((x) => x.edits && codes.includes(CODES[x.code]) && x.start < end && start < x.end)
        .map((x) => ({
          fixName: 'weft-props',
          description: `Write ${x.code === 'W082' ? 'the new' : 'the inferred'} prop type`,
          changes: [
            {
              fileName: f,
              textChanges: x.edits.map((e) => ({
                span: { start: e.start, length: e.end - e.start },
                newText: e.text,
              })),
            },
          ],
        }))
      const m = mapOf(f)
      const theirs = ls.getCodeFixesAtPosition(
        f,
        m ? toShadow(m, start) : start,
        m ? toShadow(m, end) : end,
        codes.filter((c) => c < 9000),
        ...rest,
      )
      return [...fixes, ...back(theirs, f)]
    }
    return proxy
  }
  return { create }
}

module.exports = init
