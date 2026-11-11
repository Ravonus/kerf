// U001–U005 in `kerf check` (research 45 §10): `interaction({ share })` and `ui`. TypeScript's parser only, no type
// checking: what's read is the call's own text, and a name counts as an interaction row only if this file made it.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { diagnostic, positions } from './diag.mjs'

const UNSTABLE = /\b(?:Math\.random|Date\.now|crypto\.randomUUID|performance\.now)\b/
const USER_TYPED = /\b(?:location\.|URLSearchParams|useSearchParams|searchParams|params\.get)\b/
/** veneer components that take `ui`. Anything else would write `ui="[object Object]"` on its element. */
const TAKES_UI = new Set(['Button', 'Checkbox', 'Switch', 'Radio', 'Toggle', 'Chip', 'Card'])

const rowsOf = (sf) => {
  const rows = new Set()
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText?.(sf) === 'interaction'
    )
      rows.add(n.name.text)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return rows
}

const veneerNames = (sf) => {
  const names = new Map()
  for (const n of sf.statements) {
    if (
      !ts.isImportDeclaration(n) ||
      !n.moduleSpecifier.text.startsWith('@kerf-js/veneer') ||
      !n.importClause?.namedBindings ||
      !ts.isNamedImports(n.importClause.namedBindings)
    )
      continue
    for (const s of n.importClause.namedBindings.elements)
      names.set(s.name.text, (s.propertyName ?? s.name).text)
  }
  return names
}

export function shareChecks(root, { files }) {
  const out = []
  let sharesIn
  for (const { rel, text } of files) {
    sharesIn = checkFile(rel, text, out, sharesIn)
  }
  if (sharesIn && existsSync(join(root, 'src/routes'))) {
    const file = ['src/realtime.server.ts', 'src/realtime.server.js']
      .map((f) => join(root, f))
      .find(existsSync)
    if (!file || !/\bshare\s*:/.test(readFileSync(file, 'utf8'))) {
      out.push(
        diagnostic({
          code: 'U003',
          file: sharesIn,
          span: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          offset: [0, 0],
          why: 'This app shares UI state and no `realtime({ share })` says who may: tabs work, and the socket refuses every key.',
        }),
      )
    }
  }
  return out
}

function checkFile(rel, text, out, sharesIn) {
  const usesRow = text.includes('@kerf-js/core/interaction')
  if (!usesRow && !/\bui=\{/.test(text)) return sharesIn
  const sf = ts.createSourceFile(
    rel,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const pos = positions(text)
  const report = (code, n, why) =>
    out.push(
      diagnostic({
        code,
        file: rel,
        span: pos.span(n.getStart(sf), n.end),
        offset: [n.getStart(sf), n.end],
        why,
      }),
    )
  const rows = rowsOf(sf),
    veneer = veneerNames(sf)
  const markShare = () => {
    sharesIn ??= rel
  }
  const visit = makeVisitor({ sf, usesRow, rows, veneer, report, markShare })
  visit(sf)
  return sharesIn
}

function makeVisitor({ sf, usesRow, rows, veneer, report, markShare }) {
  const visit = (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'interaction' &&
      usesRow
    ) {
      const share =
        n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])
          ? n.arguments[0].properties.find((p) => p.name?.getText(sf) === 'share')
          : undefined
      if (share) {
        markShare()
        const value = share.getText(sf)
        if (UNSTABLE.test(value))
          report(
            'U001',
            share,
            'A `share` key that changes on every load never meets another tab or client.',
          )
        else if (USER_TYPED.test(value))
          report(
            'U002',
            share,
            'This `share` key comes from what the user typed or the URL, so `realtime({ share })` is authorising a string they chose.',
          )
      }
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const l = n.left
      const target = ts.isPropertyAccessExpression(l) && l.name.text === 'value' ? l.expression : l
      if (
        ts.isPropertyAccessExpression(target) &&
        target.name.text === 'remote' &&
        ts.isIdentifier(target.expression) &&
        rows.has(target.expression.text)
      )
        report('U004', n, '`remote` is what others are doing: only the network writes it.')
    }
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      const tag = n.tagName.getText(sf),
        ui = n.attributes.properties.find(
          (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'ui',
        )
      if (ui && veneer.has(tag) && !TAKES_UI.has(veneer.get(tag)))
        report(
          'U005',
          ui,
          `\`${veneer.get(tag)}\` doesn't take \`ui\` yet, so this writes an attribute and draws nothing.`,
        )
    }
    ts.forEachChild(n, visit)
  }
  return visit
}
