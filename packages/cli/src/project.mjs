// Project view for `weft check`: what one file can't see. Today that is cross-file W014.
//
// The compiler reports W014 as a warning when `xs.value = xs.value.map(p => ({ ...p, … }))` feeds a box that leaves
// the file. Here we follow that box through JSX props (`<List items={xs.value} />`), into the component's props,
// through `derived` and further JSX props, until a JSX `.map` renders it as a keyed list. Found: the warning becomes
// an error with the list's location in `related`. The parse is syntax only (TypeScript's parser, no type checker).

import { dirname, join, relative } from 'node:path'
import ts from 'typescript'

const exts = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']
const isComponentName = name => /^[A-Z]/.test(name)

/** `a.b.c(…).d` → ['a', 'b']: the root identifier and the first member after it. */
function chainRoot(expr) {
  let node = expr
  let member
  for (;;) {
    if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node)) node = node.expression
    else if (ts.isPropertyAccessExpression(node)) {
      member = node.name.text
      node = node.expression
    } else if (ts.isElementAccessExpression(node) || ts.isCallExpression(node)) {
      member = undefined
      node = node.expression
    } else break
  }
  return ts.isIdentifier(node) ? [node.text, member] : null
}

function isInJsx(node, stop) {
  for (let n = node.parent; n && n !== stop; n = n.parent) if (ts.isJsxExpression(n)) return true
  return false
}

/** Identifiers an expression reads (not property names); `props.x` is kept as 'props.x'. */
function identifiersIn(node) {
  const names = new Set()
  const visit = n => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) names.add(`${n.expression.text}.${n.name.text}`)
    if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) names.add(n.text)
    ts.forEachChild(n, visit)
  }
  visit(node)
  return names
}

function componentsOf(sf) {
  const comps = []
  const add = (name, fn) => {
    const param = fn.parameters[0]
    const props = new Map()
    let propsIdent = null
    if (param && ts.isObjectBindingPattern(param.name)) {
      for (const el of param.name.elements) {
        if (el.dotDotDotToken || !ts.isIdentifier(el.name)) continue
        const key = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text
        props.set(el.name.text, key)
      }
    } else if (param && ts.isIdentifier(param.name)) propsIdent = param.name.text
    comps.push({ name, fn, props, propsIdent, derives: new Map(), lists: [], edges: [] })
  }
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && isComponentName(st.name.text)) add(st.name.text, st)
    if (ts.isFunctionDeclaration(st) && !st.name && st.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) add('default', st)
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isComponentName(d.name.text) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) add(d.name.text, d.initializer)
      }
    }
  }
  for (const c of comps) {
    const visit = n => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isCallExpression(n.initializer)) {
        const callee = n.initializer.expression.getText()
        if (callee === 'derived' || callee === 'state.linked') c.derives.set(n.name.text, identifiersIn(n.initializer))
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'map' && isInJsx(n, c.fn)) {
        const cb = n.arguments[0]
        const root = chainRoot(n.expression.expression)
        if (root && cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) c.lists.push({ root, at: n.getStart() })
      }
      if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && ts.isIdentifier(n.tagName) && isComponentName(n.tagName.text)) {
        for (const attr of n.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || !attr.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression) continue
          const root = chainRoot(attr.initializer.expression)
          if (root) c.edges.push({ tag: n.tagName.text, prop: attr.name.getText(), root, at: attr.getStart() })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(c.fn.body ?? c.fn)
  }
  return comps
}

/**
 * @param {Array<{ abs: string, rel: string, text: string, diagnostics: object[] }>} files
 * @param {(file: string) => { span(start: number, end: number): number[] }} pos
 */
export function projectView(files, pos) {
  // Only a W014 warning needs the project view, so most runs parse nothing here.
  if (!files.some(f => f.diagnostics.some(d => d.code === 'W014' && d.severity === 'warning'))) return
  const byAbs = new Map(files.map(f => [f.abs, f]))
  for (const f of files) {
    f.sf = ts.createSourceFile(f.abs, f.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    f.comps = componentsOf(f.sf)
    f.imports = new Map()
    for (const st of f.sf.statements) {
      if (!ts.isImportDeclaration(st) || !st.importClause || !ts.isStringLiteral(st.moduleSpecifier)) continue
      const spec = st.moduleSpecifier.text
      if (!spec.startsWith('.')) continue
      const target = exts.map(e => join(dirname(f.abs), spec + e)).find(p => byAbs.has(p))
      if (!target) continue
      if (st.importClause.name) f.imports.set(st.importClause.name.text, { file: target, name: 'default' })
      const named = st.importClause.namedBindings
      if (named && ts.isNamedImports(named)) for (const el of named.elements) f.imports.set(el.name.text, { file: target, name: (el.propertyName ?? el.name).text })
    }
  }

  const lookup = (file, tag) => {
    const local = file.comps.find(c => c.name === tag)
    if (local) return { file, comp: local }
    const imp = file.imports.get(tag)
    const target = imp && byAbs.get(imp.file)
    const comp = target?.comps.find(c => c.name === imp.name)
    return comp ? { file: target, comp } : null
  }

  /** Prop names (of `comp`) that an expression rooted at `root` reads, following `derived` locals. */
  const propsRead = (comp, [name, member], seen = new Set()) => {
    if (seen.has(name)) return new Set()
    seen.add(name)
    if (comp.props.has(name)) return new Set([comp.props.get(name)])
    if (name === comp.propsIdent && member) return new Set([member])
    const out = new Set()
    for (const dep of comp.derives.get(name) ?? []) for (const p of propsRead(comp, dep.split('.'), seen)) out.add(p)
    return out
  }

  /** Where `comp` (transitively) renders prop `prop` as a JSX `.map`, with the JSX path that gets there. */
  const reachesList = (file, comp, prop, seen = new Set()) => {
    const id = `${file.abs}#${comp.name}#${prop}`
    if (seen.has(id)) return null
    seen.add(id)
    for (const list of comp.lists) if (propsRead(comp, list.root).has(prop)) return { file, at: list.at, via: [] }
    for (const edge of comp.edges) {
      if (!propsRead(comp, edge.root).has(prop)) continue
      const next = lookup(file, edge.tag)
      const hit = next && reachesList(next.file, next.comp, edge.prop, seen)
      if (hit) return { ...hit, via: [{ file, at: edge.at, tag: edge.tag, prop: edge.prop }, ...hit.via] }
    }
    return null
  }

  /** Locals of `comp` that read `box`, following `derived`. */
  const readsBox = (comp, [name], box, seen = new Set()) => {
    if (name === box) return true
    if (seen.has(name)) return false
    seen.add(name)
    return [...(comp?.derives.get(name) ?? [])].some(dep => readsBox(comp, dep.split('.'), box, seen))
  }

  for (const f of files) {
    for (const d of f.diagnostics) {
      if (d.code !== 'W014' || d.severity !== 'warning' || !d.offset) continue
      const box = boxOf(f.sf, d.offset[0])
      if (!box) continue
      const owners = f.comps.filter(c => c.fn.pos <= d.offset[0] && d.offset[0] < c.fn.end)
      for (const comp of owners.length ? owners : f.comps) {
        let hit = null
        let edge
        for (edge of comp.edges) {
          if (!readsBox(comp, edge.root, box)) continue
          const next = lookup(f, edge.tag)
          hit = next && reachesList(next.file, next.comp, edge.prop)
          if (hit) break
        }
        if (!hit) continue
        const listPos = pos(hit.file).span(hit.at, hit.at)
        const path = [{ file: f, at: edge.at, tag: edge.tag, prop: edge.prop }, ...hit.via]
        d.severity = 'error'
        d.project = true
        d.why =
          `\`.map(p => ({ ...p, … }))\` gives every item a new identity on each update, and \`${box}\` reaches a keyed list in ` +
          `${hit.file.rel}:${listPos[0]} through ${path.map(p => `<${p.tag} ${p.prop}>`).join(' → ')}: every row re-runs on every change.`
        d.related = [
          ...path.map(p => ({ file: p.file.rel, span: pos(p.file).span(p.at, p.at), why: `passed as \`<${p.tag} ${p.prop}>\`` })),
          { file: hit.file.rel, span: listPos, why: 'rendered here as a keyed list' },
        ]
        break
      }
    }
  }
}

/** The box a flagged `.map` call writes: `box.value = …map(…)` or `const box = …map(…)`. */
function boxOf(sf, offset) {
  let found
  const visit = n => {
    if (found) return
    if (ts.isCallExpression(n) && n.getStart() === offset) found = n
    else if (n.pos <= offset && offset < n.end) ts.forEachChild(n, visit)
  }
  visit(sf)
  for (let n = found; n; n = n.parent) {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = n.left
      if (ts.isPropertyAccessExpression(left) && left.name.text === 'value' && ts.isIdentifier(left.expression)) return left.expression.text
      return null
    }
    if (ts.isVariableDeclaration(n)) return ts.isIdentifier(n.name) ? n.name.text : null
  }
  return null
}

export const relPath = (root, abs) => relative(root, abs).split('\\').join('/')
