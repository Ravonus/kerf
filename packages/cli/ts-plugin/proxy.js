const { toShadow, toSource, inGenerated } = require('../src/infer/shadow.cjs')
const { createMapping } = require('./mapping.js')

const CODES = { W080: 9080, W081: 9081, W082: 9082, W083: 9083, W084: 9084, W085: 9085 }

function positions(proxy, ls, { ensure, mapOf, back }) {
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
}

function diagnostics(proxy, ls, ts, { ensure, mapOf, sourceFile, diag, inside, findings, said }) {
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
      source: 'kerf',
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
}

function classifications(proxy, ls, { ensure, mapOf }) {
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
}

function installFixes(proxy, ls, { ensure, mapOf, back, findings }) {
  proxy.getCodeFixesAtPosition = (f, start, end, codes, ...rest) => {
    ensure()
    const fixes = findings(f)
      .filter((x) => x.edits && codes.includes(CODES[x.code]) && x.start < end && start < x.end)
      .map((x) => ({
        fixName: 'kerf-props',
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
}

function createProxy(ts, ls, { engine, textOf, ensure, sources }) {
  const { mapOf, sourceFile, back, diag, inside } = createMapping(ts, engine, textOf, sources)
  const findings = (f) => engine.findings.get(f) ?? []
  const said = (f) => findings(f).filter((x) => x.code === 'W084')
  const context = { ensure, mapOf, sourceFile, back, diag, inside, findings, said }
  const proxy = Object.create(null)
  for (const k of Object.keys(ls)) proxy[k] = (...a) => ls[k](...a)
  positions(proxy, ls, context)
  diagnostics(proxy, ls, ts, context)
  classifications(proxy, ls, context)
  installFixes(proxy, ls, context)
  return proxy
}

module.exports = { createProxy }
