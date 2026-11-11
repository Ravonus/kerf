// Surfaces in `kerf check` (research 33 §8): X002 and X009–X012 for surfaces and their text, X040 and X041 for per-glyph
// markup, and P101 for a surface that needs a slot nothing provides. X001, X003 and X004 need the live mirror, so
// @kerf-js/core/surface reports those in dev. `listSurfaces` is the catalog behind `kerf surfaces` and the MCP tool.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { diagnostic, positions } from './diag.mjs'
import { discover } from './files.mjs'
import { scanJsx } from './jsx-scan.mjs'

const CODE = /\.[cm]?[jt]sx?$/
const SYSTEM = /(^|,)\s*["']?(system-ui|-apple-system|BlinkMacSystemFont)["']?\s*(,|$)/i
const GENERIC_ONLY = /^\s*(serif|sans-serif|monospace|cursive|fantasy)\s*$/i
const GLYPHS = 200

const parse = (rel, text) =>
  ts.createSourceFile(
    rel,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

const prop = (object, name) =>
  object.properties.find(
    (p) =>
      (ts.isPropertyAssignment(p) ||
        ts.isMethodDeclaration(p) ||
        ts.isShorthandPropertyAssignment(p)) &&
      p.name.getText() === name,
  )
const stringOf = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (c) => walk(c, visit))
}

/** Every `defineSurface({ ... })` call in a file: the call, its options and the name of `setup`'s `s`. */
function surfaceCalls(sf) {
  const out = []
  walk(sf, (node) => {
    if (!ts.isCallExpression(node) || node.expression.getText() !== 'defineSurface') return
    const def = node.arguments[0]
    if (!def || !ts.isObjectLiteralExpression(def)) return
    const setup = prop(def, 'setup')
    const fn = setup && (ts.isMethodDeclaration(setup) ? setup : setup.initializer)
    out.push({ node, def, fn, param: fn?.parameters?.[0]?.name.getText() })
  })
  return out
}

function propNames(call) {
  const schema = prop(call.def, 'props')?.initializer
  if (
    schema &&
    ts.isCallExpression(schema) &&
    schema.expression.getText().endsWith('.object') &&
    ts.isObjectLiteralExpression(schema.arguments[0] ?? schema)
  )
    return schema.arguments[0].properties.map((p) => p.name.getText())
  const type = call.node.typeArguments?.[0]
  if (type && ts.isTypeLiteralNode(type))
    return type.members.map((m) => m.name?.getText()).filter(Boolean)
  return []
}

/** What the project's `defineSurface` calls declare, read statically: nothing needs to build. */
export function listSurfaces(root, { exclude = [] } = {}) {
  const out = []
  for (const rel of discover(root, { include: ['src/**/*.{ts,tsx,js,jsx}'], exclude })) {
    const text = readFileSync(join(root, rel), 'utf8')
    if (!text.includes('defineSurface')) continue
    const sf = parse(rel, text)
    for (const call of surfaceCalls(sf)) {
      const line = sf.getLineAndCharacterOfPosition(call.node.getStart(sf)).line + 1
      out.push({
        name: stringOf(prop(call.def, 'name')?.initializer) ?? null,
        kind: stringOf(prop(call.def, 'kind')?.initializer) ?? null,
        props: propNames(call),
        file: rel,
        line,
        ...(prop(call.def, 'pixel') ? { pixel: true } : {}),
      })
    }
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

/** `[...x]`, `x.split('')` or `Array.from(x)`: the string being spread, or undefined. */
function glyphSource(node) {
  if (
    ts.isArrayLiteralExpression(node) &&
    node.elements.length === 1 &&
    ts.isSpreadElement(node.elements[0])
  )
    return node.elements[0].expression
  if (!ts.isCallExpression(node)) return undefined
  const callee = node.expression.getText()
  if (
    callee === 'Array.from' &&
    node.arguments.length === 1 &&
    !ts.isObjectLiteralExpression(node.arguments[0])
  )
    return node.arguments[0]
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'split' &&
    stringOf(node.arguments[0]) === ''
  )
    return node.expression.expression
  return undefined
}

/** The first `<span>` a `.map` callback returns. */
function returnedSpan(fn) {
  let span
  walk(fn.body, (n) => {
    if (span) return
    const open = ts.isJsxElement(n)
      ? n.openingElement
      : ts.isJsxSelfClosingElement(n)
        ? n
        : undefined
    if (open?.tagName.getText() === 'span') span = open
  })
  return span
}

const attrOf = (open, name) =>
  open.attributes.properties.some((p) => !ts.isJsxSpreadAttribute(p) && p.name.getText() === name)
const spreads = (open) => open.attributes.properties.some(ts.isJsxSpreadAttribute)

/** The JSX element a child expression sits in. */
function jsxParent(node) {
  for (let n = node.parent; n; n = n.parent) if (ts.isJsxElement(n)) return n.openingElement
  return undefined
}

/** A string literal, or a `const` in this file holding one. */
function knownString(sf, node) {
  const direct = stringOf(node)
  if (direct !== undefined) return direct
  if (!ts.isIdentifier(node)) return undefined
  let found
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText() === node.text &&
      ts.isVariableDeclarationList(n.parent) &&
      n.parent.flags & ts.NodeFlags.Const
    )
      found ??= stringOf(n.initializer)
  })
  return found
}

function glyphChecks(sf, report) {
  walk(sf, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== 'map'
    )
      return
    const source = glyphSource(node.expression.expression)
    const fn = node.arguments[0]
    if (!source || !fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return
    const span = returnedSpan(fn)
    if (!span) return
    const text = knownString(sf, source)
    const count = text === undefined ? 0 : Array.from(text).length
    if (count > GLYPHS)
      report(
        'X040',
        node,
        `Per-grapheme spans over ${count} graphemes: each is a DOM node, a style and a composited layer once it animates. Use word-level motion or a Surface.`,
      )
    const hidden = attrOf(span, 'aria-hidden') || spreads(span)
    const parent = jsxParent(node)
    const named =
      !parent ||
      attrOf(parent, 'aria-label') ||
      attrOf(parent, 'aria-labelledby') ||
      spreads(parent)
    if (!hidden || !named)
      report(
        'X041',
        span,
        `Per-character spans read as separate letters to a screen reader${hidden ? '' : ': add `aria-hidden` to each span'}${named ? '' : `${hidden ? ':' : ', and'} give the parent an \`aria-label\` with the whole text`}.`,
      )
  })
}

function surfaceFileChecks(sf, slots, report) {
  const calls = surfaceCalls(sf)
  if (!calls.length) return
  const decorative = new Set()
  walk(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'decorative'
    )
      decorative.add(n)
  })
  const inside = (n) => {
    for (let p = n.parent; p; p = p.parent) if (decorative.has(p)) return true
    return false
  }
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return
    const method = n.expression.name.text
    if ((method === 'fillText' || method === 'strokeText') && !inside(n))
      report(
        'X010',
        n,
        `\`${method}\` in a surface draws text only the canvas knows about: no selection, find, translation or screen reader. Use \`s.text()\`, or \`s.decorative()\` for text that is truly decoration.`,
      )
    if (
      method === 'setAttribute' &&
      stringOf(n.arguments[0]) === 'aria-hidden' &&
      n.expression.expression.getText().endsWith('.el')
    )
      report(
        'X011',
        n,
        'This hides the surface or its text mirror from assistive tech. Leave the mirror to kerf.',
      )
  })
  for (const call of calls) {
    const kindNode = prop(call.def, 'kind')?.initializer
    const kind = stringOf(kindNode)
    if (kind && slots && slots['surface.renderer'] && !slots['surface.renderer'][kind])
      report(
        'P101',
        kindNode,
        `Surface kind \`${kind}\` has no provider: add the plugin that provides it to \`plugins\` in kerf.config.ts.`,
      )
    if (!call.param || !call.fn) continue
    walk(call.fn, (n) => {
      if (!ts.isCallExpression(n) || n.expression.getText() !== `${call.param}.text`) return
      const options = n.arguments[1]
      const font =
        options && ts.isObjectLiteralExpression(options)
          ? stringOf(prop(options, 'font')?.initializer)
          : undefined
      const family = font?.replace(/^.*?\d[\d.]*px(\/\S+)?\s*/, '')
      if (family !== undefined && (SYSTEM.test(family) || GENERIC_ONLY.test(family)))
        report(
          'X002',
          n.arguments[1],
          `\`${font}\` can't be measured safely: \`system-ui\`, \`-apple-system\` and generic-only families resolve differently in canvas and CSS. Name a family.`,
        )
      if (kind === 'canvas2d' && slots && slots['text.measure'] === null)
        report(
          'P101',
          n,
          'Canvas `s.text()` needs `text.measure`, and nothing provides it: add `text()` from `@kerf-js/text` to `plugins` in kerf.config.ts.',
        )
    })
  }
}

const HIDES = /(?:display\s*:\s*none|visibility\s*:\s*hidden)/

/** X011/X012 in a stylesheet: rules aimed at the host or the mirror. */
function cssChecks(file, report) {
  const css = file.text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const rule = /([^{}]*\[data-surface(-text)?\b[^{}]*)\{([^}]*)\}/g
  for (const m of css.matchAll(rule)) {
    const at = m.index + m[0].indexOf('[data-surface')
    const before = css.slice(0, m.index)
    const open = before.lastIndexOf('@media')
    const inPrint =
      open >= 0 &&
      /^@media[^{]*\bprint\b/.test(before.slice(open)) &&
      (before.slice(open).match(/\{/g) ?? []).length >
        (before.slice(open).match(/\}/g) ?? []).length
    if (/forced-color-adjust\s*:\s*none/.test(m[3]))
      report(
        'X012',
        at,
        at + 13,
        '`forced-color-adjust: none` on a surface keeps its author colours in forced-colours mode, where the mirror must take over.',
      )
    else if (inPrint && HIDES.test(m[3]))
      report(
        'X012',
        at,
        at + 13,
        'This hides surface text when printing, where the mirror is the only copy that prints sharply.',
      )
    else if (m[2] && HIDES.test(m[3]))
      report(
        'X011',
        at,
        at + 18,
        'This hides the text mirror from assistive tech, and it is the only copy a screen reader can read. Leave the mirror to kerf.',
      )
  }
}

/**
 * @param {string} root
 * @param {{ files: { rel: string, text: string }[], exclude?: string[], slots?: Record<string, any> }} options
 */
export function surfaceChecks(root, { files, exclude = [], slots }) {
  const out = []
  const reporter = (file) => {
    const pos = positions(file.text)
    return (code, start, end, why) =>
      out.push(
        diagnostic({ code, file: file.rel, span: pos.span(start, end), offset: [start, end], why }),
      )
  }
  const sources = new Map(files.filter((f) => CODE.test(f.rel)).map((f) => [f.rel, f]))
  for (const rel of discover(root, { include: ['src/**/*.{ts,tsx,js,jsx}'], exclude })) {
    if (!sources.has(rel)) sources.set(rel, { rel, text: readFileSync(join(root, rel), 'utf8') })
  }
  for (const f of sources.values()) {
    const glyphs = /\.[jt]sx$/.test(f.rel) && /\.map\(/.test(f.text) && /<span\b/.test(f.text)
    const surfaces = f.text.includes('@kerf-js/core/surface')
    if (!glyphs && !surfaces) continue
    let sf
    try {
      sf = parse(f.rel, f.text)
    } catch {
      continue
    }
    const raw = reporter(f)
    const report = (code, node, why) => raw(code, node.getStart(sf), node.end, why)
    if (glyphs) glyphChecks(sf, report)
    if (!surfaces) continue
    surfaceFileChecks(sf, slots, report)
    if (!/\.[jt]sx$/.test(f.rel)) continue
    const scan = scanJsx(f.text, f.rel)
    const local = scan.imports.find(
      (i) => i.source === '@kerf-js/core/surface' && i.imported === 'Surface',
    )?.local
    for (const el of scan.elements) {
      if (el.name !== local) continue
      const spread = el.attrs.some((a) => a.kind === 'spread')
      if (!el.attr('label') && !el.attr('decorative') && !spread)
        raw(
          'X009',
          el.start,
          el.tagEnd,
          `<${el.name}> has no accessible name: a screen reader finds an unnamed image. Add \`label\`, or \`decorative\` if it shows nothing a reader needs.`,
        )
      const hidden = el.attr('aria-hidden')
      if (hidden && hidden.value !== 'false')
        raw(
          'X011',
          hidden.start,
          hidden.end,
          'This hides the surface and its text mirror from assistive tech. For a surface with nothing to read use `decorative`, which leaves mirrors alone.',
        )
      const style = el.attr('style')
      if (
        style &&
        /forced-color-adjust\s*:\s*none|forcedColorAdjust\s*:\s*['"]none/.test(
          style.value ?? style.expr ?? '',
        )
      )
        raw(
          'X012',
          style.start,
          style.end,
          '`forced-color-adjust: none` on a surface keeps its author colours in forced-colours mode, where the mirror must take over.',
        )
    }
  }
  for (const rel of discover(root, { include: ['**/*.css'], exclude })) {
    const text = readFileSync(join(root, rel), 'utf8')
    if (text.includes('data-surface')) cssChecks({ rel, text }, reporter({ rel, text }))
  }
  return out
}
