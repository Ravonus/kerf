// `weft lsp`: TypeScript 7 loads no plugins and its content mappers refuse `.tsx`, so the one place left to stand is
// between the editor and `tsc --lsp`. Buffers go in as their shadows; positions are mapped both ways (research 44 §6).

import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { Session, projectTypescript } = require('./session.cjs')
const { inGenerated, toShadow, toSource } = require('./shadow.cjs')

const RANGES = new Set([
  'range',
  'selectionRange',
  'targetRange',
  'targetSelectionRange',
  'originSelectionRange',
  'insert',
  'replace',
])

function framed(stream, on) {
  let buffer = Buffer.alloc(0)
  stream.on('data', (d) => {
    buffer = Buffer.concat([buffer, d])
    for (;;) {
      const head = buffer.indexOf('\r\n\r\n')
      if (head < 0) return
      const len = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, head).toString())[1])
      if (buffer.length < head + 4 + len) return
      const msg = JSON.parse(buffer.subarray(head + 4, head + 4 + len).toString())
      buffer = buffer.subarray(head + 4 + len)
      on(msg)
    }
  })
}
const frame = (msg) => {
  const body = Buffer.from(JSON.stringify(msg))
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body])
}

const offsetAt = (text, { line, character }) => {
  let at = 0
  for (let i = 0; i < line; i++) {
    const n = text.indexOf('\n', at)
    if (n < 0) return text.length
    at = n + 1
  }
  return at + character
}
const positionAt = (text, offset) => {
  const head = text.slice(0, offset)
  const line = head.split('\n').length - 1
  return { line, character: offset - (head.lastIndexOf('\n') + 1) }
}

export function lsp(root, { input = process.stdin, output = process.stdout } = {}) {
  const dir = projectTypescript(root)
  if (!dir)
    throw Object.assign(
      new Error(
        '`weft lsp` needs TypeScript 7 in the project; older versions use the tsserver plugin',
      ),
      { code: 'E_USAGE' },
    )
  const exe = join(
    dirname(
      createRequire(join(realpathSync(dir), 'package.json')).resolve(
        `@typescript/typescript-${process.platform}-${process.arch}/package.json`,
      ),
    ),
    'lib',
    process.platform === 'win32' ? 'tsc.exe' : 'tsc',
  )
  const server = spawn(exe, ['--lsp', '--stdio'], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] })
  const session = new Session(ts, root)
  const docs = new Map() // uri → { file, text, sent, version }
  const pending = new Map() // request id → uri
  const toServer = (m) => server.stdin.write(frame(m))
  const toClient = (m) => output.write(frame(m))
  const fileOf = (uri) => fileURLToPath(uri)
  const mapOf = (doc) => doc && session.engine.maps.get(doc.file)

  const pos = (doc, p, to) => {
    const map = mapOf(doc)
    if (!map) return p
    return to
      ? positionAt(map.text, toShadow(map, offsetAt(doc.text, p)))
      : positionAt(doc.text, toSource(map, offsetAt(map.text, p)))
  }
  const back = (value, doc) => {
    if (Array.isArray(value)) return value.map((v) => back(v, doc))
    if (!value || typeof value !== 'object') return value
    const uri = value.uri ?? value.targetUri
    const here = uri ? (docs.get(uri) ?? doc) : doc
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (RANGES.has(k) && v?.start && mapOf(here))
        out[k] = { start: pos(here, v.start), end: pos(here, v.end) }
      else out[k] = back(v, here)
    }
    return out
  }
  const generated = (doc, d) => {
    const map = mapOf(doc)
    if (!map) return false
    const a = offsetAt(map.text, d.range.start)
    return inGenerated(map, a, offsetAt(map.text, d.range.end) - a)
  }
  const ours = (doc) =>
    (session.engine.findings.get(doc.file) ?? []).map((f) => ({
      range: { start: positionAt(doc.text, f.start), end: positionAt(doc.text, f.end) },
      severity: f.severity === 'warning' ? 2 : 1,
      code: f.code,
      source: 'weft',
      message: `${f.why} Fix: ${f.help}`,
    }))
  const items = (doc, list) => [
    ...back(
      list.filter((d) => !generated(doc, d)),
      doc,
    ).filter(
      (d) =>
        !(session.engine.findings.get(doc.file) ?? []).some(
          (f) =>
            f.code === 'W084' &&
            offsetAt(doc.text, d.range.start) < f.end &&
            f.start <= offsetAt(doc.text, d.range.start),
        ),
    ),
    ...ours(doc),
  ]

  /** Inference over the buffers, then every open file whose shadow moved. */
  async function refresh(changed) {
    if (session.host)
      session.host.update(
        new Map(
          changed.flatMap((f) =>
            session.engine.maps.has(f) ? [] : [[f, session.engine.texts.get(f)]],
          ),
        ),
      )
    await session.analyze(session.host ? changed : undefined)
    for (const [uri, doc] of docs) {
      const text = session.engine.maps.get(doc.file)?.text ?? doc.text
      if (text === doc.sent) continue
      doc.sent = text
      toServer({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: { textDocument: { uri, version: ++doc.version }, contentChanges: [{ text }] },
      })
    }
  }

  // One at a time: a request has to see the shadow its position is mapped for.
  let line = Promise.resolve()
  framed(input, (msg) => {
    line = line.then(() => client(msg)).catch((e) => process.stderr.write(`weft lsp: ${e.stack}\n`))
  })
  async function client(msg) {
    const p = msg.params
    if (msg.method === 'textDocument/didOpen') {
      const doc = {
        file: fileOf(p.textDocument.uri),
        text: p.textDocument.text,
        version: p.textDocument.version,
      }
      docs.set(p.textDocument.uri, doc)
      session.engine.set(doc.file, doc.text)
      await refresh([doc.file])
      doc.sent = session.engine.maps.get(doc.file)?.text ?? doc.text
      return toServer({ ...msg, params: { textDocument: { ...p.textDocument, text: doc.sent } } })
    }
    if (msg.method === 'textDocument/didChange') {
      const doc = docs.get(p.textDocument.uri)
      for (const c of p.contentChanges)
        doc.text = c.range
          ? doc.text.slice(0, offsetAt(doc.text, c.range.start)) +
            c.text +
            doc.text.slice(offsetAt(doc.text, c.range.end))
          : c.text
      session.engine.set(doc.file, doc.text)
      return refresh([doc.file])
    }
    const doc = p?.textDocument && docs.get(p.textDocument.uri)
    if (msg.id !== undefined && doc) pending.set(msg.id, { doc, method: msg.method })
    if (doc && p.position)
      return toServer({ ...msg, params: { ...p, position: pos(doc, p.position, true) } })
    toServer(msg)
  }

  framed(server.stdout, (msg) => {
    if (msg.method === 'textDocument/publishDiagnostics') {
      const doc = docs.get(msg.params.uri)
      return toClient(
        doc
          ? { ...msg, params: { ...msg.params, diagnostics: items(doc, msg.params.diagnostics) } }
          : msg,
      )
    }
    const hold = msg.id !== undefined && !msg.method ? pending.get(msg.id) : null
    if (!hold) return toClient(msg)
    pending.delete(msg.id)
    if (hold.method === 'textDocument/diagnostic' && msg.result?.items)
      return toClient({
        ...msg,
        result: { ...msg.result, items: items(hold.doc, msg.result.items) },
      })
    toClient({ ...msg, result: back(msg.result, hold.doc) })
  })
  server.on('exit', (code) => {
    session.close()
    process.exitCode = code ?? 0
  })
  return {
    server,
    close: () => {
      server.kill()
      session.close()
    },
  }
}
