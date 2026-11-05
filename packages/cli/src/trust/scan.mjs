import { builtinModules } from 'node:module'
import ts from 'typescript'

const builtins = new Set(builtinModules)
const NEEDS = {
  fs: 'fs',
  'fs/promises': 'fs',
  child_process: 'spawn',
  cluster: 'spawn',
  net: 'net',
  tls: 'net',
  dgram: 'net',
  dns: 'net',
  'dns/promises': 'net',
  http: 'net',
  https: 'net',
  http2: 'net',
}
const NET_GLOBALS = new Set(['fetch', 'WebSocket', 'EventSource'])
/** Bundlers inline it, and it says nothing about the machine. */
const AMBIENT_ENV = new Set(['NODE_ENV'])

/** What one file does directly, and what it imports. */
export function scanFile(text, file) {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.[cm]?tsx?$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
  )
  const uses = []
  const imports = []
  const use = (need, node) =>
    uses.push({ need, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 })
  const specifier = (name, node) => {
    const bare = name.replace(/^node:/, '')
    if (name.endsWith('.node')) use('native', node)
    else if (builtins.has(bare)) NEEDS[bare] && use(NEEDS[bare], node)
    else imports.push(name)
  }
  const isProcess = (node) => ts.isIdentifier(node) && node.text === 'process'
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      if (!(node.importClause?.isTypeOnly || node.isTypeOnly))
        specifier(node.moduleSpecifier.text, node)
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression
      const [first] = node.arguments
      if (
        (callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) && callee.text === 'require')) &&
        first &&
        ts.isStringLiteralLike(first)
      )
        specifier(first.text, node)
      else if (ts.isIdentifier(callee) && NET_GLOBALS.has(callee.text)) use('net', node)
      else if (
        ts.isPropertyAccessExpression(callee) &&
        isProcess(callee.expression) &&
        callee.name.text === 'dlopen'
      )
        use('native', node)
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      NET_GLOBALS.has(node.expression.text)
    )
      use('net', node)
    else if (
      ts.isPropertyAccessExpression(node) &&
      isProcess(node.expression) &&
      node.name.text === 'env'
    ) {
      const parent = node.parent
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node)
        AMBIENT_ENV.has(parent.name.text) || use(`env:${parent.name.text}`, node)
      else if (
        ts.isElementAccessExpression(parent) &&
        parent.expression === node &&
        ts.isStringLiteralLike(parent.argumentExpression)
      )
        AMBIENT_ENV.has(parent.argumentExpression.text) ||
          use(`env:${parent.argumentExpression.text}`, node)
      else use('env:*', node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { uses, imports }
}
