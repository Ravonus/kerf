// Payments in `weft check` (research 10 §7): the mistakes that lose money or give it away, found from the source. Most
// fire in a project that has `weft/pay`, but a key, a price id or a hand-written webhook fires in any app. A check only
// looks at a file that a cheap regex says could hit, so an app with no payments pays a scan and no parse.
//
// The client is everything in `src` that isn't a server module. `src/pay/catalog.ts` is client code on purpose: it holds
// names and amounts, which is why a rail's ids don't go there (PAY012).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { diagnostic, positions } from './diag.mjs'
import { discover } from './files.mjs'
import { isTestFile } from './tests.mjs'

const CODE = 'src/**/*.{ts,tsx,js,jsx,mts,mjs}'
const CONFIGS = ['weft.config.ts', 'weft.config.mts', 'weft.config.js', 'weft.config.mjs', 'weft.config.json', 'weft.config.yaml', 'weft.config.yml']
const isServer = rel => /^src\/server\//.test(rel) || /\.server\.[cm]?[jt]sx?$/.test(rel)

const KEY = /\b(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{6,}|whsec_[A-Za-z0-9]{6,})\b/g
const PLACEHOLDER = /placeholder|example|your|xxxx/i
const SERVER_ENV = /\b(?:process\.env|import\.meta\.env)\.\w*STRIPE_(?:SECRET_KEY|WEBHOOK_SECRET|RESTRICTED_KEY)\b/g
const RAIL_ID = /^(?:price|prod|plink)_[A-Za-z0-9]{8,}$/
const STRIPE_EVENT = /['"`](?:checkout\.session\.completed|customer\.subscription\.\w+|invoice\.paid|invoice\.payment_\w+|payment_intent\.succeeded|charge\.refunded)['"`]/
const VERIFIED = /constructEvent|verifyWebhook|\.webhook\(|\.verify\(|stripe-signature/i
const SECRET_OPTION = /\bstripe\(\s*\{[^}]*\b(?:secretKey|webhookSecret)\b/
const PAID_NAME = /pro\b|paid|premium|entitle|purchas|subscri|unlock|grant|isPro|hasAccess/i
const MONEY = /[$€£¥]\s?\d/

const parse = (rel, text) => ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, c => walk(c, visit))
}

const at = (sf, rel, node) => {
  const pos = positions(sf.text)
  const [a, b] = [node.getStart(sf), node.getEnd()]
  return { file: rel, span: pos.span(a, b), offset: [a, b] }
}
const spanOf = (text, rel, index, length) => ({ file: rel, span: positions(text).span(index, index + length), offset: [index, index + length] })
const prop = (object, name) => object.properties.find(p => p.name?.getText() === name)
const callee = node => (ts.isCallExpression(node) ? node.expression.getText() : '')
const isFunction = n => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)

function enclosing(node) {
  for (let n = node.parent; n; n = n.parent) if (isFunction(n)) return n
  return undefined
}

/** PAY003: a key in the source, or a server secret read where the client can reach it. */
function secrets(rel, text, server, out) {
  for (const m of text.matchAll(KEY)) {
    if (PLACEHOLDER.test(m[0])) continue
    out.push(diagnostic({ code: 'PAY003', ...spanOf(text, rel, m.index, m[0].length), why: `A key is in the source: \`${m[0].slice(0, 8)}…\`. Anyone who can read this can charge or refund as you, and it stays in git after you delete it.` }))
  }
  if (!server) for (const m of text.matchAll(SERVER_ENV)) out.push(diagnostic({ code: 'PAY003', ...spanOf(text, rel, m.index, m[0].length), why: `\`${m[0]}\` is read in client code: a build inlines it, or it is undefined there.` }))
}

/** PAY012: a rail's own id where the client bundle gets it. */
function railIds(rel, sf, out) {
  walk(sf, n => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && RAIL_ID.test(n.text)) out.push(diagnostic({ code: 'PAY012', ...at(sf, rel, n), why: `\`${n.text}\` is a rail's id in client code: the page now names a rail, and a client that sends a price picks its own.` }))
  })
}

/** PAY008: a float or a bare number in `product({ … })`, with the integer as an edit for two-decimal currencies. */
function money(rel, sf, out) {
  const amounts = (object, path) => {
    for (const p of object.properties) {
      if (!ts.isPropertyAssignment(p) || !/^[a-z]{3}$/.test(p.name.getText())) continue
      const v = p.initializer
      if (!ts.isNumericLiteral(v) || Number.isInteger(Number(v.text))) continue
      const fixed = String(Math.round(Number(v.text) * 100))
      const place = at(sf, rel, v)
      out.push(diagnostic({ code: 'PAY008', ...place, why: `\`${path}.${p.name.getText()}\` is ${v.text}: money is whole minor units, and a float rounds differently on each rail.`, fix: { description: `Write ${fixed}, assuming a currency with two decimals`, safe: false, edits: [{ ...place, text: fixed }] } }))
    }
  }
  walk(sf, n => {
    if (callee(n) !== 'product' || !n.arguments[0] || !ts.isObjectLiteralExpression(n.arguments[0])) return
    const def = n.arguments[0]
    const id = prop(def, 'id')?.initializer?.text ?? 'product'
    const price = prop(def, 'price')?.initializer
    if (price && ts.isNumericLiteral(price)) out.push(diagnostic({ code: 'PAY008', ...at(sf, rel, price), why: `\`${id}\`'s price has no currency: ${price.text} of what?` }))
    if (price && ts.isObjectLiteralExpression(price)) amounts(price, `${id}.price`)
    const plans = prop(def, 'plans')?.initializer
    if (plans && ts.isObjectLiteralExpression(plans)) for (const p of plans.properties) if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) amounts(p.initializer, `${id}.${p.name.getText()}`)
  })
}

/** PAY004: paid state written on the client on the strength of `checkout()` returning. */
function clientGrants(rel, sf, out) {
  const writes = (scope, from) => {
    walk(scope, n => {
      if (n.getStart(sf) < from) return
      const target = ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken ? n.left.getText() : ts.isCallExpression(n) && /(^|\.)(setItem|set)$/.test(callee(n)) ? `${callee(n)} ${n.arguments[0]?.getText() ?? ''}` : undefined
      if (target && PAID_NAME.test(target)) out.push(diagnostic({ code: 'PAY004', ...at(sf, rel, n), why: `\`${n.getText().slice(0, 60)}\` follows \`checkout()\`, which only opens the rail's page. Nobody has paid yet, and a refund would never undo this.` }))
    })
  }
  walk(sf, n => {
    if (callee(n) !== 'checkout') return
    const up = n.parent
    if (ts.isAwaitExpression(up)) {
      const fn = enclosing(n)
      if (fn?.body) writes(fn.body, n.getEnd())
    }
    if (ts.isPropertyAccessExpression(up) && up.name.text === 'then' && ts.isCallExpression(up.parent) && up.parent.arguments[0]) writes(up.parent.arguments[0], 0)
  })
}

/** PAY005: a price typed into the page beside something sold. */
function hardcoded(rel, sf, out) {
  walk(sf, n => {
    if (ts.isJsxText(n) && MONEY.test(n.text)) out.push(diagnostic({ code: 'PAY005', ...at(sf, rel, n), why: `\`${n.text.trim().slice(0, 40)}\` is a price typed by hand: it drifts from what \`checkout\` charges.` }))
  })
}

/** PAY015: `ctx.entitlements.has()` used as if it were a boolean. A promise is truthy, so this lets everyone in. */
function unawaited(rel, sf, out) {
  walk(sf, n => {
    if (!/(^|\.)entitlements\.has$/.test(callee(n))) return
    const up = n.parent
    const tested = (ts.isIfStatement(up) && up.expression === n) || (ts.isConditionalExpression(up) && up.condition === n) || (ts.isPrefixUnaryExpression(up) && up.operator === ts.SyntaxKind.ExclamationToken) || (ts.isBinaryExpression(up) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(up.operatorToken.kind))
    if (!tested) return
    const place = at(sf, rel, n)
    const fn = enclosing(n)
    const async = fn?.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
    const edit = async && { fix: { description: 'Await it', safe: true, edits: [{ file: rel, span: positions(sf.text).span(place.offset[0], place.offset[0]), offset: [place.offset[0], place.offset[0]], text: 'await ' }] } }
    out.push(diagnostic({ code: 'PAY015', ...place, why: `\`${n.getText()}\` isn't awaited: it is a promise, which is always truthy, so the check passes for everyone.`, ...edit }))
  })
}

/** PAY010: a buyer no one has signed in. */
function anonymous(rel, sf, out) {
  walk(sf, n => {
    if (callee(n) !== 'mutation' || !n.arguments[0] || !ts.isObjectLiteralExpression(n.arguments[0])) return
    const def = n.arguments[0]
    if (/\.checkout\(\s*ctx\b/.test(def.getText()) && !prop(def, 'auth')) out.push(diagnostic({ code: 'PAY010', ...at(sf, rel, n), why: 'This mutation opens a checkout with no `auth: \'user\'`: a purchase with no owner can\'t be restored or granted.' }))
  })
}

/** PAY011: a webhook that believes what it's sent. */
function webhooks(rel, text, sf, out) {
  if (STRIPE_EVENT.test(text) && /\.json\(\)|JSON\.parse/.test(text) && !VERIFIED.test(text)) {
    const m = STRIPE_EVENT.exec(text)
    out.push(diagnostic({ code: 'PAY011', ...spanOf(text, rel, m.index, m[0].length), why: `This handles ${m[0]} without checking a signature: anyone who finds the URL can POST themselves a purchase.` }))
  }
  if (!/\bPayRail\b/.test(text)) return
  walk(sf, n => {
    if (!((ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n)) && n.name.getText() === 'verify')) return
    const fn = ts.isPropertyAssignment(n) ? n.initializer : n
    if (!/\bheaders\b/.test(fn.getText())) out.push(diagnostic({ code: 'PAY011', ...at(sf, rel, n.name), why: "This rail's `verify` never reads `headers`, so it can't be checking a signature." }))
  })
}

/** Every id the server really enforces: `requires` and awaited `entitlements.has`, in server modules and route `load`s. */
function enforced(rel, sf, ids) {
  walk(sf, n => {
    if (/(^|\.)entitlements\.has$/.test(callee(n)) && n.arguments[0]?.text) ids.add(n.arguments[0].text)
    if (ts.isPropertyAssignment(n) && n.name.getText() === 'requires' && ts.isArrayLiteralExpression(n.initializer)) for (const e of n.initializer.elements) if (e.text) ids.add(e.text)
  })
}

/** Client reads of `entitlements`: `mine.value?.includes('pro')`, wherever the file got that list from. */
function clientReads(rel, sf, reads) {
  if (!/\bentitlements\b/.test(sf.text)) return
  walk(sf, n => {
    if (!ts.isCallExpression(n) || !/\.(includes|has)$/.test(n.expression.getText()) || !n.arguments[0]?.text) return
    reads.push({ rel, sf, node: n, id: n.arguments[0].text })
  })
}

/**
 * @param {string} root
 * @param {{ exclude?: string[], slots: Record<string, unknown>, testRels?: string[] }} options
 */
export function payChecks(root, { exclude = [], slots, testRels = [] }) {
  const out = []
  const rels = discover(root, { include: [CODE], exclude }).filter(r => !isTestFile(r) && !r.endsWith('.d.ts'))
  const rails = Object.entries(slots?.['pay.rail'] ?? {}).filter(([, name]) => name)
  const payFile = ['ts', 'mts', 'js', 'mjs'].map(x => `src/pay.server.${x}`).find(f => existsSync(join(root, f)))
  const known = new Set()
  const reads = []
  let usesPay = rails.length > 0 || !!payFile

  for (const rel of rels) {
    const text = readFileSync(join(root, rel), 'utf8')
    const server = isServer(rel)
    secrets(rel, text, server, out)
    const relevant = /weft\/pay|entitlements|requires:|\bcheckout\b|\bproduct\(|PayRail|price_|prod_|plink_/.test(text) || STRIPE_EVENT.test(text)
    if (!relevant) continue
    if (text.includes('weft/pay')) usesPay = true
    const sf = parse(rel, text)
    webhooks(rel, text, sf, out)
    money(rel, sf, out)
    unawaited(rel, sf, out)
    enforced(rel, sf, known)
    if (server) anonymous(rel, sf, out)
    else {
      railIds(rel, sf, out)
      if (/\bcheckout\b/.test(text)) {
        clientGrants(rel, sf, out)
        hardcoded(rel, sf, out)
      }
      clientReads(rel, sf, reads)
    }
  }

  for (const r of reads) {
    if (known.has(r.id)) continue
    out.push(diagnostic({ code: 'PAY013', ...at(r.sf, r.rel, r.node), why: `\`${r.id}\` is checked only on the client: no \`requires\` or \`ctx.entitlements.has\` on the server names it, so a request made by hand gets the same thing as a paying user.`, help: `Add \`requires: ['${r.id}']\` to the query or mutation it protects, or check \`await ctx.entitlements.has('${r.id}')\` in the route's \`load\`` }))
  }

  for (const rel of CONFIGS) {
    if (!existsSync(join(root, rel))) continue
    const text = readFileSync(join(root, rel), 'utf8')
    secrets(rel, text, true, out)
    const m = SECRET_OPTION.exec(text)
    if (m) out.push(diagnostic({ code: 'PAY003', ...spanOf(text, rel, m.index, m[0].length), why: 'Plugin options are written into `.weft/slots/`, so a key given here sits in a generated file.' }))
  }

  for (const rel of testRels) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    const text = readFileSync(abs, 'utf8')
    for (const m of text.matchAll(/\b(?:sk|rk)_live_\w+/g)) out.push(diagnostic({ code: 'T030', ...spanOf(text, rel, m.index, m[0].length), why: 'A live key in a test: it charges real cards, and it is now in git.' }))
  }

  if (!usesPay) return out
  if (rails.length && !payFile) out.push(diagnostic({ code: 'PAY014', file: 'weft.config.ts', why: `\`pay.rail\` is bound to ${rails.map(([, n]) => n).join(', ')}, but there is no \`src/pay.server.ts\`: no webhook is mounted, so a payment would grant nothing.` }))
  if (payFile && !rails.length) out.push(diagnostic({ code: 'P101', file: payFile, why: '`src/pay.server.ts` needs a `pay.rail` provider, and nothing provides it: every checkout fails.', help: '`weft add pay`, or add a rail plugin to `plugins`' }))
  if (payFile) {
    const text = readFileSync(join(root, payFile), 'utf8')
    const m = /memoryPayStore\(/.exec(text)
    if (m) out.push(diagnostic({ code: 'PAY016', ...spanOf(text, payFile, m.index, m[0].length - 1), why: 'The ledger is in memory: purchases are gone on restart, and a production server refuses to start with it.' }))
    if (rails.some(([key]) => key === 'stripe')) {
      const env = ['.env.example', 'src/env.server.ts', '.env'].filter(f => existsSync(join(root, f))).map(f => readFileSync(join(root, f), 'utf8')).join('\n')
      if (!env.includes('STRIPE_WEBHOOK_SECRET')) out.push(diagnostic({ code: 'PAY011', file: payFile, why: 'Nothing declares `STRIPE_WEBHOOK_SECRET`. Without it the rail refuses every webhook, so no purchase ever lands.', help: 'Add `STRIPE_WEBHOOK_SECRET` to `.env.example` and `src/env.server.ts`' }))
    }
  }
  return out
}
