import ts from 'typescript'

// 3. move functions: returns { base, lazy } sources for one module. A requested function leaves a stub in the
// base; a helper that only moved code references (and that upstream does not export) moves with it.
export function moveFunctions(file, src, moves) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  const decls = declarations(sf, moves)
  assignPacks(decls)
  return movedSources(file, src, sf, decls)
}

function declarations(sf, moves) {
  const decls = []
  for (const st of sf.statements) {
    let names = [],
      value = true
    if (ts.isFunctionDeclaration(st) && st.name) names = [st.name.text]
    else if (ts.isVariableStatement(st))
      names = st.declarationList.declarations
        .filter((d) => ts.isIdentifier(d.name))
        .map((d) => d.name.text)
    else if (
      ts.isTypeAliasDeclaration(st) ||
      ts.isInterfaceDeclaration(st) ||
      ts.isClassDeclaration(st)
    ) {
      names = st.name ? [st.name.text] : []
      value = ts.isClassDeclaration(st)
    }
    if (!names.length) continue
    const refs = new Set()
    const walk = (n) => {
      if (
        ts.isIdentifier(n) &&
        !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) &&
        !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)
      )
        refs.add(n.text)
      ts.forEachChild(n, walk)
    }
    walk(st)
    for (const nm of names) refs.delete(nm)
    // module-level bindings this declaration assigns (a moved copy could not: imports are read-only)
    const writes = new Set()
    const ww = (n) => {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        n.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        ts.isIdentifier(n.left)
      )
        writes.add(n.left.text)
      if (
        (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
        ts.isIdentifier(n.operand) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
      )
        writes.add(n.operand.text)
      ts.forEachChild(n, ww)
    }
    if (ts.isFunctionDeclaration(st)) ww(st)
    decls.push({
      st,
      names,
      value,
      refs,
      writes,
      exported: !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
      pack: ts.isFunctionDeclaration(st) ? moves[st.name.text] : undefined,
      requested: ts.isFunctionDeclaration(st) && !!moves[st.name?.text],
    })
  }
  return decls
}

function assignPacks(decls) {
  // a function that assigns a module-level binding staying in the base cannot move (its copy would assign
  // an import); drop such requests until none is left
  const topLet = new Map()
  for (const d of decls) if (ts.isVariableStatement(d.st)) for (const n of d.names) topLet.set(n, d)
  for (let changed = true; changed;) {
    changed = false
    for (let k = 0; k < 2; k++)
      for (let c2 = true; c2;) {
        c2 = false
        for (const d of decls) {
          if (d.pack || !d.value || d.exported) continue
          const referrers = decls.filter((o) => o !== d && d.names.some((n) => o.refs.has(n)))
          if (!referrers.length) continue
          const packs = new Set(referrers.map((o) => o.pack))
          if (packs.size === 1 && !packs.has(undefined)) {
            d.pack = [...packs][0]
            c2 = true
            changed = true
          }
        }
      }
    for (const d of decls) {
      if (!d.pack) continue
      for (const w of d.writes) {
        const owner = topLet.get(w)
        if (owner && owner.pack !== d.pack) {
          d.pack = undefined
          d.requested = false
          changed = true
          break
        }
      }
    }
    // helpers that moved only because of a function that no longer moves come back
    for (const d of decls) {
      if (!d.pack || d.requested) continue
      const referrers = decls.filter((o) => o !== d && d.names.some((n) => o.refs.has(n)))
      if (referrers.some((o) => o.pack !== d.pack)) {
        d.pack = undefined
        changed = true
      }
    }
    if (changed) continue
    break
  }
  for (let changed = false; changed;) {
    changed = false
    for (const d of decls) {
      if (d.pack || !d.value || d.exported) continue
      const referrers = decls.filter((o) => o !== d && d.names.some((n) => o.refs.has(n)))
      if (!referrers.length) continue
      const packs = new Set(referrers.map((o) => o.pack))
      if (packs.size === 1 && !packs.has(undefined)) {
        d.pack = [...packs][0]
        changed = true
      }
    }
  }
}

function movedSources(file, src, sf, decls) {
  const edits = [],
    moved = {},
    topNames = [],
    stubs = []
  for (const d of decls) {
    const st = d.st
    if (d.pack) {
      const text = src.slice(st.getStart(sf), st.end).replace(/^export\s+/, '')
      ;(moved[d.pack] ??= []).push(text)
      if (d.requested) {
        const name = st.name.text
        stubs.push({ n: name, pack: d.pack })
        const params = st.parameters
          .map((p) =>
            p.initializer?.kind === ts.SyntaxKind.FalseKeyword
              ? p.getText(sf)
              : p.getText(sf).replace(/\s*=[^,]*$/, ''),
          )
          .join(', ')
        const ret = st.type ? st.type.getText(sf) : 'any'
        edits.push([
          st.getStart(sf),
          st.end,
          `export function ${name}(${params}): ${ret} {\n  return (__packs.${name} ?? __missing('${d.pack}', '${name}'))(${st.parameters.map((p) => p.name.getText(sf)).join(', ')})\n}`,
        ])
      } else
        edits.push([
          st.getStart(sf),
          st.end,
          `// moved to the "${d.pack}" pack: ${d.names.join(', ')}`,
        ])
      continue
    }
    topNames.push(...d.names.map((n) => ({ n, type: !d.value })))
    if (!d.exported) edits.push([st.getStart(sf), st.getStart(sf), 'export '])
  }
  edits.sort((a, b) => b[0] - a[0])
  let base = src
  for (const [s0, e, t] of edits) base = base.slice(0, s0) + t + base.slice(e)
  const imports = sf.statements.filter(ts.isImportDeclaration).map((d) => d.getText(sf))
  const lazy = {}
  for (const [pack, texts] of Object.entries(moved)) {
    const mod = './' + file.replace(/\.ts$/, '.js')
    const values = [
      ...topNames.filter((x) => !x.type).map((x) => x.n),
      ...stubs.filter((x) => x.pack !== pack).map((x) => x.n),
    ]
    const types = topNames.filter((x) => x.type).map((x) => x.n)
    lazy[pack] =
      [
        `// Moved here from ${file} by scripts/specialize.mjs (pack "${pack}"). Upstream code, unchanged.`,
        ...imports,
        values.length ? `import { ${values.join(', ')} } from '${mod}'` : '',
        types.length ? `import type { ${types.join(', ')} } from '${mod}'` : '',
        ...texts.map((t) => 'export ' + t),
      ].join('\n') + '\n'
  }
  if (Object.keys(moved).length) base = `import { __packs, __missing } from './packs.js'\n` + base
  return { base, lazy }
}
