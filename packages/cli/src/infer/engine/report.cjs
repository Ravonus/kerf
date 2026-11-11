const { MARK } = require('../facts.cjs')

function note(file, finding) {
  if (!this.findings.has(file)) this.findings.set(file, [])
  this.findings.get(file).push(finding)
}

function annotation(c, type) {
  const text = `: ${MARK} ${type}`
  if (c.written) return [{ start: c.written[0], end: c.written[1], text }]
  if (c.parens) return [{ start: c.nameEnd, end: c.nameEnd, text }]
  return [
    { start: c.paramSpan[0], end: c.paramSpan[0], text: '(' },
    { start: c.nameEnd, end: c.nameEnd, text: `${text})` },
  ]
}

function oddFindings(c, st, line) {
  for (const o of st.odd ?? []) {
    const use = o.use?.span ? this.texts.get(c.file).slice(...o.use.span) : o.key
    this.note(o.file, {
      code: 'W084',
      start: o.whole[0],
      end: o.whole[1],
      why: `\`${o.key}\` here is ${o.type}, but \`${c.name}\` uses it as ${o.want} (\`${use}\`, line ${line(c.file, o.use?.span?.[0] ?? c.nameSpan[0])}), and its other callers agree`,
      help: `Pass ${o.want} here, or change \`${c.name}\` to handle ${o.type} (a type parameter, if the two props must agree)`,
    })
  }
}

function report(c) {
  const st = this.state.get(c.id)
  if (!st || st.route) return
  const [start, end] = c.nameSpan
  const line = (file, pos) => this.texts.get(file).slice(0, pos).split('\n').length
  if (st.unnamed)
    this.note(c.file, {
      code: 'W085',
      severity: 'warning',
      start,
      end,
      why: `\`${c.name}\`'s inferred props name a type this scope can't see, so they fell back to \`any\`: ${st.unnamed}`,
      help: 'Move the type to module scope or export it, or annotate the parameter',
    })
  const exposed = c.exported
  if (st.noCallers && !exposed) {
    const escaped = this.facts.get(c.file).escaped.has(c.name)
    this.note(
      c.file,
      escaped
        ? {
            code: 'W083',
            severity: 'warning',
            start,
            end,
            why: `\`${c.name}\` is used as a value and no JSX site for it could be traced, so its props are \`any\``,
            help: `Annotate its parameter: function ${c.name}(props: { ... })`,
          }
        : {
            code: 'W080',
            start,
            end,
            why: `\`${c.name}\` has an untyped parameter and nothing renders it, so its props have nothing to be inferred from`,
            help: `Render it (\`<${c.name} ... />\`), delete it, or annotate the parameter: function ${c.name}(props: { ... })`,
          },
    )
  }
  if (exposed) {
    const type = st.type
    const edits = this.annotation(c, type)
    const bad = st.noCallers
    if (!c.written)
      this.note(c.file, {
        code: 'W081',
        start,
        end,
        why: `\`${c.name}\` is exported with no prop type${bad ? ' and no caller to infer one from' : ''}. An export's type is written down, so a caller's edit can't change a public API unseen`,
        help: `\`kerf fix\` writes the inferred type: ${c.name}(props: ${type})`,
        edits: bad ? undefined : edits,
        safe: !bad,
      })
    else if (c.writtenType.replace(MARK, '').trim() !== type && !bad)
      this.note(c.file, {
        code: 'W082',
        start,
        end,
        why: `\`${c.name}\`'s written prop type no longer matches its callers: it says ${c.writtenType.replace(MARK, '').trim()}, they need ${type}`,
        help: '`kerf fix` rewrites it (a diff to review), or delete the /*inferred*/ comment to keep the type you have',
        edits,
        safe: true,
      })
  }
  for (const a of st.anyFrom) {
    const origin = this.origin(a.file, a.span)
    this.note(c.file, {
      code: 'W083',
      severity: 'warning',
      start,
      end,
      why: `\`${c.name}\`'s prop \`${a.key}\` is ${a.body ? 'typed from its use in the body, because' : '`any`, because'} the value at ${a.tag} (line ${line(a.file, a.span[0])}) is \`any\`${origin ? `: it comes from ${origin}` : ''}`,
      help: 'Give that source a type, or annotate the prop',
    })
  }
  oddFindings.call(this, c, st, line)
}

function originOf(file, span) {
  const ts = this.ts
  const text = this.texts.get(file)
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  let node = null
  const find = (n) => {
    if (n.getStart(sf) <= span[0] && n.end >= span[1]) {
      node = n
      ts.forEachChild(n, find)
    }
  }
  ts.forEachChild(sf, find)
  for (let i = 0; node && i < 6; i++) {
    if (ts.isPropertyAccessExpression(node)) node = node.expression
    if (
      ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      node = node.expression
      continue
    }
    if (ts.isCallExpression(node))
      return `\`${node.getText(sf).slice(0, 48)}\` (line ${lineOf(node)})`
    if (!ts.isIdentifier(node)) return `\`${node.getText(sf).slice(0, 48)}\` (line ${lineOf(node)})`
    let decl = null
    const look = (n) => {
      if (
        (ts.isVariableDeclaration(n) ||
          ts.isParameter(n) ||
          ts.isImportSpecifier(n) ||
          ts.isImportClause(n)) &&
        n.name?.getText(sf) === node.text &&
        n.pos < node.pos
      )
        decl = n
      ts.forEachChild(n, look)
    }
    ts.forEachChild(sf, look)
    if (!decl) return `\`${node.text}\``
    if (ts.isParameter(decl))
      return `the parameter \`${node.text}\`, which has no type (line ${lineOf(decl)})`
    if (ts.isImportSpecifier(decl) || ts.isImportClause(decl))
      return `\`${node.text}\`, imported at line ${lineOf(decl)}`
    if (!decl.initializer) return `\`${node.text}\` (line ${lineOf(decl)})`
    node = decl.initializer
  }
  return null
}

module.exports = { note, annotation, report, origin: originOf }
