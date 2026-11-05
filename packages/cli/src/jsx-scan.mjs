// A small JSX view of one .tsx/.jsx file (research 26 §2.5, §7), shared by the X-code pass and plugin `check` hooks:
// imports, every element with its attributes and ancestors, and the file's function bodies by name. TypeScript's
// parser only, no type checking.

import ts from 'typescript'

/**
 * @typedef {{ name: string, kind: 'string' | 'expr' | 'bool' | 'spread', value?: string, expr?: string, start: number, end: number, valueStart?: number, valueEnd?: number }} Attr
 * @typedef {{ name: string, attrs: Attr[], attr: (n: string) => Attr | undefined, ancestors: string[], start: number, end: number, tagEnd: number, children: string }} Element
 * @typedef {{ local: string, imported?: string, source: string, start: number, end: number }} Import
 */

/**
 * @param {string} text
 * @param {string} [file]
 * @returns {{ imports: Import[], elements: Element[], functions: Map<string, string> }}
 */
export function scanJsx(text, file = 'file.tsx') {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  )
  const imports = []
  const elements = []
  const functions = new Map()
  const stack = []

  const record = (open, node) => {
    const attrs = attrsOf(sf, open.attributes)
    const el = {
      name: open.tagName.getText(sf),
      attrs,
      attr: (n) => attrs.find((a) => a.name === n),
      ancestors: [...stack],
      start: node.getStart(sf),
      end: node.end,
      tagEnd: open.tagName.end,
      children: ts.isJsxElement(node) ? node.children.map((c) => c.getText(sf)).join('') : '',
    }
    elements.push(el)
    return el
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const source = node.moduleSpecifier.text
      const c = node.importClause
      const at = { source, start: node.getStart(sf), end: node.end }
      if (c?.name) imports.push({ local: c.name.text, ...at })
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings))
        for (const s of c.namedBindings.elements)
          imports.push({ local: s.name.text, imported: s.propertyName?.text ?? s.name.text, ...at })
      if (!c) imports.push({ local: '', ...at })
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body)
      functions.set(node.name.text, node.body.getText(sf))
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      functions.set(node.name.text, node.initializer.body.getText(sf))
    }
    if (ts.isJsxSelfClosingElement(node)) {
      record(node, node)
    } else if (ts.isJsxElement(node)) {
      const el = record(node.openingElement, node)
      // attribute expressions (a `pending={<X />}`) see this element as an ancestor too
      stack.push(el.name)
      ts.forEachChild(node, visit)
      stack.pop()
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { imports, elements, functions }
}

/** The import an identifier in an expression (`{hero}`, `{hero.src}`) comes from, or undefined. */
export function importOf(scan, expr) {
  const id = /^\s*([A-Za-z_$][\w$]*)/.exec(expr ?? '')?.[1]
  return id ? scan.imports.find((i) => i.local === id) : undefined
}

function attrsOf(sf, attributes) {
  return attributes.properties.map((p) => {
    if (ts.isJsxSpreadAttribute(p))
      return {
        name: '...',
        kind: 'spread',
        expr: p.expression.getText(sf),
        start: p.getStart(sf),
        end: p.end,
      }
    const name = p.name.getText(sf)
    const base = { name, start: p.getStart(sf), end: p.end }
    if (!p.initializer) return { ...base, kind: 'bool' }
    if (ts.isStringLiteral(p.initializer))
      return {
        ...base,
        kind: 'string',
        value: p.initializer.text,
        valueStart: p.initializer.getStart(sf),
        valueEnd: p.initializer.end,
      }
    const e = p.initializer.expression
    if (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)))
      return {
        ...base,
        kind: 'string',
        value: e.text,
        valueStart: e.getStart(sf),
        valueEnd: e.end,
      }
    return {
      ...base,
      kind: 'expr',
      expr: e ? e.getText(sf) : '',
      valueStart: e?.getStart(sf),
      valueEnd: e?.end,
    }
  })
}
