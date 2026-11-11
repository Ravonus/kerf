import { spawn, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import ts from 'typescript'
import { bin } from './helpers.mjs'

const require = createRequire(import.meta.url)
const { Session } = require('../src/infer/session.cjs')
const { shadow, toShadow, toSource } = require('../src/infer/shadow.cjs')

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..')
const tmp = join(here, '.tmp')
const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

/** The fixture with TypeScript 7 (or `typescript`'s own 6, when `version` says so), kerf and the CLI linked in. */
function app(
  files: Record<string, string | null> = {},
  { version = 7, plugin }: { version?: number; plugin?: boolean } = {},
) {
  mkdirSync(tmp, { recursive: true })
  const dir = mkdtempSync(join(tmp, 'infer-'))
  made.push(dir)
  cpSync(join(here, 'fixtures/infer'), dir, { recursive: true })
  mkdirSync(join(dir, 'node_modules/@kerf-js'), { recursive: true })
  symlinkSync(join(cli, '../kerf'), join(dir, 'node_modules/@kerf-js/core'))
  symlinkSync(cli, join(dir, 'node_modules/@kerf-js/cli'))
  symlinkSync(join(cli, '../start'), join(dir, 'node_modules/@kerf-js/start'))
  if (version === 7)
    symlinkSync(join(cli, '../core/node_modules/typescript'), join(dir, 'node_modules/typescript'))
  if (plugin) {
    const config = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'))
    config.compilerOptions.plugins = [{ name: '@kerf-js/cli/ts-plugin' }]
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config))
  }
  for (const [f, text] of Object.entries(files)) {
    if (text === null) {
      rmSync(join(dir, f))
      continue
    }
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    writeFileSync(join(dir, f), text)
  }
  return dir
}

async function run(dir: string) {
  const session = new Session(ts, dir)
  const result = await session.analyze()
  const types = Object.fromEntries(
    session.engine
      .comps()
      .map((c: { name: string; id: string }) => [c.name, session.engine.state.get(c.id)?.type]),
  )
  const list = [...result.findings, ...result.errors].flatMap(([f, l]) =>
    l.map((x: { start: number }) => ({
      ...x,
      file: f.slice(dir.length + 1),
      line: session.engine.texts.get(f).slice(0, x.start).split('\n').length,
    })),
  )
  session.close()
  return { types, list, started: result.started }
}

const goalOnly = {
  'src/edges.tsx': null,
  'src/card.tsx': null,
  'src/other.tsx': null,
  'src/routes/index.tsx': null,
}

describe('shadow', () => {
  it('maps positions both ways around edits', () => {
    const m = shadow('abcdefgh', [
      { start: 2, end: 2, text: 'XY' },
      { start: 4, end: 6, text: '' },
    ])
    expect(m.text).toBe('abXYcdgh')
    expect(toShadow(m, 3)).toBe(5)
    expect(toSource(m, 5)).toBe(3)
    expect(toSource(m, 6)).toBe(6)
    expect(toSource(m, 3)).toBe(2)
  })
})

describe.each([
  ['tsgo', 7],
  ['typescript 6', 6],
])('inference on %s', (_, version) => {
  it('warns when an inferred type is local to a caller', async () => {
    // A private member keeps the caller-local class named in the inferred prop type.
    const page = (type: string) => `
      function Card(props) { return <p>{props.item.name}</p> }
      export function Page() {
        ${type}
        const item = new Item()
        return <Card item={item} />
      }
    `
    const itemType = "class Item { private marker = 0; name = 'one' }"
    const local = await run(app({ ...goalOnly, 'src/goal.tsx': page(itemType) }, { version }))
    expect(local.list).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'W085' })]))
    const visible = page('').replace('function Card', `${itemType}; function Card`)
    const repaired = await run(app({ ...goalOnly, 'src/goal.tsx': visible }, { version }))
    expect(repaired.list.filter((finding: { code: string }) => finding.code === 'W085')).toEqual([])
  }, 60_000)

  it('the goal: props.count is number, from bind: at the only call site', async () => {
    const r = await run(app(goalOnly, { version }))
    expect(r.types.AddButton).toBe('{ count: number }')
    expect(r.list).toEqual([])
  }, 60_000)

  it('bind: satisfies a required prop, and a box of the wrong type is an error', async () => {
    const page = (box: string) =>
      `import { state } from '@kerf-js/core'\nfunction Card(props: { n: number }) { return <b>{props.n}</b> }\nexport default function P() { const box = state(${box}); return <Card bind:n={box} /> }\n`
    expect((await run(app({ ...goalOnly, 'src/goal.tsx': page('1') }, { version }))).list).toEqual(
      [],
    )
    expect(
      (await run(app({ ...goalOnly, 'src/goal.tsx': page("'a'") }, { version }))).list,
    ).toMatchObject([{ code: 'TS2322', file: 'src/goal.tsx', line: 3 }])
  }, 60_000)

  it('misuse in the child is a real error at the true source', async () => {
    const goal = readFileSync(join(here, 'fixtures/infer/src/goal.tsx'), 'utf8')
    expect(goal).toContain('props.count++')
    const r = await run(
      app(
        {
          ...goalOnly,
          'src/goal.tsx': goal.replace('props.count++', 'props.count.toUpperCase()'),
        },
        { version },
      ),
    )
    expect(r.list).toMatchObject([{ code: 'TS2339', file: 'src/goal.tsx', line: 7 }])
  }, 60_000)
})

describe.each([
  ['tsgo', 7],
  ['typescript 6', 6],
])('inference edges on %s', (_, version) => {
  it('every edge in the fixture', async () => {
    const { types: t, list } = await run(app({}, { version }))
    expect(t).toMatchObject({
      Opt: '{ a: number; b?: string; size?: number }',
      Show: '{ v: number | string }',
      Inc: '{ n: number }',
      Outer: '{ x: number }',
      Inner: '{ x: number }',
      Tree: '{ node: TreeNode }',
      A: '{ x: number }',
      B: '{ x: number }',
      Host: '{ icon: typeof Star }',
      Star: '{ size: number }',
      Plain: '{ t: string }',
      Slow: '{ ms: number }',
      Tab: '{ kind: "one" | "two" }',
      Field: '{ kind: "text"; value: string } | { kind: "num"; value: number; digits: number }',
      Closure: '{ d: number }',
      UsesLocal: '{ l: Local }',
      Card: '{ title: string }',
      Shared: '{ n: number }',
      Cb: '{ f: (arg0: number) => any; g: any[] }',
      List: '{ items: number[]; children: (arg0: number) => any }',
    })
    expect(t.Save).toContain('Omit<Parameters<typeof Button>[0], "variant">')
    expect(t.Rest).toBe('Omit<Parameters<typeof Button>[0], "title"> & { title: string }')
    expect(t.Home).toContain('RouteProps')
    const codes = list.map((d) => `${d.code}:${d.file}:${d.line}`)
    expect(codes).toContain('W084:src/edges.tsx:153')
    expect(codes.filter((c) => c.startsWith('TS'))).toEqual([]) // the odd caller's own error is W084
    expect(list.find((d) => d.code === 'W084').why).toMatch(
      /`n` here is string, but `Inc` uses it as number/,
    )
    expect(
      list
        .filter((d) => d.code === 'W083')
        .map((d) => d.why)
        .join(),
    ).toMatch(/JSON\.parse\('\{\}'\)` \(line 98\)/)
    expect(codes.filter((c) => c.startsWith('W080'))).toHaveLength(1)
    expect(codes.filter((c) => c.startsWith('W081'))).toEqual([
      'W081:src/card.tsx:1',
      'W081:src/card.tsx:4',
      'W081:src/card.tsx:7',
    ])
  }, 60_000)
})

describe('explicit annotations and pinning', () => {
  it('leaves an annotated component alone', async () => {
    const r = await run(
      app({
        ...goalOnly,
        'src/goal.tsx':
          'function A(props: { n: string }) { return <p>{props.n}</p> }\nexport const B = () => <A n="x" />\n',
      }),
    )
    expect(r.started).toBe(false)
    expect(r.types).toEqual({})
  })

  it('an edit to a generated type shows as W082, and a written one with the comment deleted is yours', async () => {
    const one = {
      ...goalOnly,
      'src/a.tsx':
        'export function A(props: /*inferred*/ { n: string }) { return <p>{props.n}</p> }\nexport const B = () => <A n={1} />\n',
      'src/goal.tsx': null,
    }
    expect((await run(app(one))).list).toMatchObject([{ code: 'W082' }])
    const two = { ...one, 'src/a.tsx': one['src/a.tsx'].replace('/*inferred*/ ', '') }
    const session = new Session(ts, app(two))
    const { errors } = await session.all()
    session.close()
    expect([...errors.values()].flat()).toMatchObject([{ code: 'TS2322' }])
  }, 60_000)
})

describe('after the checker rests', () => {
  it('a closed checker starts again with what it had', async () => {
    const session = new Session(ts, app(goalOnly))
    await session.analyze()
    const before = [...session.engine.state.values()][0].type
    session.close()
    const file = [...session.engine.facts.keys()][0]
    session.engine.set(file, `${session.engine.texts.get(file)}\n// saved\n`)
    await session.analyze([file])
    expect([...session.engine.state.values()][0].type).toBe(before)
    expect(session.host).not.toBeNull()
    session.close()
  })

  it('bind(box) at a site reads as the value', async () => {
    const r = await run(
      app({
        ...goalOnly,
        'src/goal.tsx':
          "import { bind, state } from '@kerf-js/core'\nfunction Inc(props) { return <b onClick={() => props.n++}>+</b> }\nexport default function P() { const box = state(0); return <Inc n={bind(box)} /> }\n",
      }),
    )
    expect(r.types.Inc).toBe('{ n: number }')
    expect(r.list).toEqual([])
  }, 60_000)
})

describe('agents', () => {
  it('AGENTS.md says to leave props untyped, within its size limit', async () => {
    const { agentsMd } = await import('../src/agents-md.mjs')
    const out = await agentsMd(app(goalOnly))
    expect(out.text).toContain('**Leave props untyped**')
    expect(out.overLimit).toBe(false)
  })

  it('a diagnostic tells an agent what to do, as the code it can act on', () => {
    const dir = app({
      ...goalOnly,
      'src/goal.tsx': 'function Row(props) { return <li>{props.a}</li> }\nexport const X = 1\n',
    })
    const r = spawnSync(process.execPath, [bin, 'tsc', '--json', '--root', dir], {
      encoding: 'utf8',
    })
    const d = JSON.parse(r.stdout).diagnostics[0]
    expect(d).toMatchObject({
      code: 'W080',
      severity: 'error',
      file: 'src/goal.tsx',
      span: [1, 10, 1, 13],
      docs: 'kerf docs W080',
    })
    expect(d.fix.text).toContain('annotate the parameter: function Row(props: { ... })')
  }, 60_000)
})

describe('the CLI', () => {
  const kerf = (...args: string[]) => {
    const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })
    return { code: r.status, stdout: r.stdout, stderr: r.stderr }
  }

  it('kerf tsc reports with source positions, agent-style in --json', () => {
    const dir = app({
      ...goalOnly,
      'src/goal.tsx':
        'function Inc(props) { return <b onClick={() => props.n++}>+</b> }\nexport default function P() { return <div><Inc n={1} /><Inc n="x" /></div> }\n',
      'src/routes/index.tsx': null,
    })
    const r = kerf('tsc', '--json', '--root', dir)
    const out = JSON.parse(r.stdout)
    expect(r.code).toBe(1)
    expect(out.diagnostics).toMatchObject([
      { code: 'W084', file: 'src/goal.tsx', span: [2, 61, 2, 66], docs: 'kerf docs W084' },
    ])
    expect(out.diagnostics[0].fix.text).toMatch(/Pass number here/)
  }, 60_000)

  it('kerf fix writes exported types, and a plain tsc then accepts the export', () => {
    const dir = app({
      ...goalOnly,
      'src/goal.tsx':
        'import { Card } from \'./card\'\nexport default function P() { return <Card title="t" /> }\n',
      'src/card.tsx': 'export function Card(props) { return <h2>{props.title}</h2> }\n',
      'src/routes/index.tsx': null,
    })
    writeFileSync(join(dir, 'kerf.config.json'), '{}')
    expect(kerf('fix', '--json', '--root', dir).code).toBe(0)
    expect(readFileSync(join(dir, 'src/card.tsx'), 'utf8')).toContain(
      'Card(props: /*inferred*/ { title: string })',
    )
    const tsc = spawnSync(
      process.execPath,
      [join(dir, 'node_modules/typescript/bin/tsc'), '-p', dir, '--noEmit'],
      { encoding: 'utf8' },
    )
    expect(tsc.stdout).toBe('')
  }, 60_000)
})

function tsserver(dir: string) {
  const child = spawn(
    process.execPath,
    [
      join(cli, 'node_modules/typescript/lib/tsserver.js'),
      '--pluginProbeLocations',
      dir,
      '--disableAutomaticTypingAcquisition',
    ],
    { cwd: dir, stdio: ['pipe', 'pipe', 'ignore'] },
  )
  let seq = 0,
    buffer = Buffer.alloc(0)
  const wait = new Map<number, (value: unknown) => void>()
  const events = []
  child.stdout.on('data', (d) => {
    buffer = Buffer.concat([buffer, d])
    for (;;) {
      const head = buffer.indexOf('\r\n\r\n')
      if (head < 0) return
      const len = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, head).toString())![1])
      if (buffer.length < head + 4 + len) return
      const msg = JSON.parse(buffer.subarray(head + 4, head + 4 + len).toString())
      buffer = buffer.subarray(head + 4 + len)
      if (msg.type === 'response') {
        wait.get(msg.request_seq)?.(msg)
        wait.delete(msg.request_seq)
      } else events.push(msg)
    }
  })
  const send = (command: string, args: Record<string, unknown>) => {
    child.stdin.write(
      `${JSON.stringify({ seq: ++seq, type: 'request', command, arguments: args })}\n`,
    )
    return seq
  }
  return {
    child,
    send,
    ask: <T>(command: string, args: Record<string, unknown>) =>
      new Promise<{ body: T }>((ok) => {
        wait.set(send(command, args), (value) => ok(value as { body: T }))
      }),
  }
}

describe('the dev listener', () => {
  const listen = async (dir: string) => {
    const { attachProps } = await import('../src/props-listener.mjs')
    const server = Object.assign(new EventEmitter(), {
      watcher: new EventEmitter(),
      sent: [] as { type: string }[],
      ws: { send: (m: { type: string }) => server.sent.push(m) },
      config: { logger: { warn() {}, info() {} } },
      close: async () => {},
    })
    const live = attachProps(server, dir, {})
    const next = (kind: string) =>
      new Promise<{ type: string; diagnostics: unknown[] }>((ok) => {
        const on = (m: { type: string; diagnostics: unknown[] }) => {
          if (m.type === kind) {
            live!.worker.off('message', on)
            ok(m)
          }
        }
        live!.worker.on('message', on)
      })
    return { server, live, next }
  }

  it('reports a save, off the main thread, and clears when it is fixed', async () => {
    const dir = app(goalOnly)
    const { server, next } = await listen(dir)
    await next('done')
    const file = join(dir, 'src/goal.tsx')
    const good = readFileSync(file, 'utf8')
    expect(good).toContain('props.count++')
    writeFileSync(file, good.replace('props.count++', 'props.count.oops()'))
    server.watcher.emit('change', file)
    const bad = await next('done')
    expect(bad.diagnostics).toMatchObject([{ code: 'TS2339', file: 'src/goal.tsx', line: 7 }])
    expect(
      JSON.parse(readFileSync(join(dir, '.kerf/props.json'), 'utf8')).diagnostics,
    ).toHaveLength(1)
    await new Promise((ok) => {
      setTimeout(ok, 5)
    })
    expect(server.sent.map((m) => m.type)).toContain('error')
    writeFileSync(file, good)
    server.watcher.emit('change', file)
    expect((await next('done')).diagnostics).toEqual([])
    await server.close()
  }, 30_000)

  it("writes an exported type into the source once the file is quiet, and a caller's edit changes it", async () => {
    const dir = app({
      ...goalOnly,
      'src/goal.tsx':
        'import { Card } from \'./card\'\nexport default function P() { return <Card title="t" /> }\n',
      'src/card.tsx': 'export function Card(props) { return <h2>{props.title}</h2> }\n',
    })
    const { server, next } = await listen(dir)
    const card = join(dir, 'src/card.tsx')
    await next('wrote')
    expect(readFileSync(card, 'utf8')).toContain('Card(props: /*inferred*/ { title: string })')
    server.watcher.emit('change', card)
    await next('done')
    const caller = join(dir, 'src/goal.tsx')
    writeFileSync(caller, readFileSync(caller, 'utf8').replace('title="t"', 'title={1}'))
    server.watcher.emit('change', caller)
    await next('wrote')
    expect(readFileSync(card, 'utf8')).toContain('Card(props: /*inferred*/ { title: number })')
    await server.close()
  }, 30_000)
})

type LspReply = { result: { range: { start: { line: number } }; items: { code: string }[] } }

async function editorHoverAndDiagnostics() {
  const dir = app({
    ...goalOnly,
    'src/card.tsx': 'export function Card(props) { return <h2>{props.title}</h2> }\n',
    'src/use.tsx': 'import { Card } from \'./card\'\nexport const Use = () => <Card title="t" />\n',
  })
  const child = spawn(process.execPath, [bin, 'lsp', '--root', dir], {
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  let id = 0,
    buffer = Buffer.alloc(0)
  const wait = new Map<number, (value: unknown) => void>()
  child.stdout.on('data', (d) => {
    buffer = Buffer.concat([buffer, d])
    for (;;) {
      const head = buffer.indexOf('\r\n\r\n')
      if (head < 0) return
      const len = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, head).toString())![1])
      if (buffer.length < head + 4 + len) return
      const msg = JSON.parse(buffer.subarray(head + 4, head + 4 + len).toString())
      buffer = buffer.subarray(head + 4 + len)
      if (msg.id !== undefined && !msg.method) {
        wait.get(msg.id)?.(msg)
        wait.delete(msg.id)
      } else if (msg.id !== undefined)
        child.stdin.write(wire({ jsonrpc: '2.0', id: msg.id, result: null }))
    }
  })
  const wire = (m: unknown) => {
    const b = Buffer.from(JSON.stringify(m))
    return Buffer.concat([Buffer.from(`Content-Length: ${b.length}\r\n\r\n`), b])
  }
  const note = (method: string, params: unknown) =>
    child.stdin.write(wire({ jsonrpc: '2.0', method, params }))
  const ask = (method: string, params: unknown) =>
    new Promise<LspReply>((ok) => {
      wait.set(++id, (value) => ok(value as LspReply))
      child.stdin.write(wire({ jsonrpc: '2.0', id, method, params }))
    })
  try {
    await ask('initialize', {
      processId: null,
      rootUri: pathToFileURL(dir).href,
      capabilities: { textDocument: { hover: { contentFormat: ['plaintext'] }, diagnostic: {} } },
    })
    note('initialized', {})
    const file = join(dir, 'src/goal.tsx')
    const uri = pathToFileURL(file).href
    const text = readFileSync(file, 'utf8')
    note('textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescriptreact', version: 1, text },
    })
    const lines = text.split('\n')
    const line = lines.findIndex((l) => l.includes('function AddButton'))
    const hover = await ask('textDocument/hover', {
      textDocument: { uri },
      position: { line, character: lines[line]!.indexOf('props.count') + 7 },
    })
    expect(JSON.stringify(hover.result)).toContain('count: number')
    expect(hover.result.range.start.line).toBe(line)
    const clean = await ask('textDocument/diagnostic', { textDocument: { uri } })
    expect(clean.result.items).toEqual([])

    const card = join(dir, 'src/card.tsx')
    note('textDocument/didOpen', {
      textDocument: {
        uri: pathToFileURL(card).href,
        languageId: 'typescriptreact',
        version: 1,
        text: readFileSync(card, 'utf8'),
      },
    })
    const w = await ask('textDocument/diagnostic', {
      textDocument: { uri: pathToFileURL(card).href },
    })
    expect(w.result.items.map((d) => d.code)).toEqual(['W081'])
  } finally {
    child.kill()
  }
}

describe('an editor on TypeScript 7, through kerf lsp', () => {
  it('hover and diagnostics at source positions, over tsc --lsp', editorHoverAndDiagnostics, 60_000)
})

const editorApp = () =>
  app(
    {
      ...goalOnly,
      'src/card.tsx': 'export function Card(props) { return <h2>{props.title}</h2> }\n',
      'src/use.tsx':
        'import { Card } from \'./card\'\nexport const Use = () => <Card title="t" />\n',
    },
    { version: 6, plugin: true },
  )

async function editorTsProtocol() {
  const dir = editorApp()
  const file = join(dir, 'src/goal.tsx')
  const s = tsserver(dir)
  try {
    s.send('open', { file })
    const lines = readFileSync(file, 'utf8').split('\n')
    const line = lines.findIndex((l) => l.includes('function AddButton')) + 1
    const bodyLine = lines.findIndex((l) => l.includes('props.count++')) + 1
    expect(bodyLine).toBeGreaterThan(0)
    const hover = (
      await s.ask<{ displayString: string; start: { line: number } }>('quickinfo', {
        file,
        line: bodyLine,
        offset: lines[bodyLine - 1]!.indexOf('props.count') + 8,
      })
    ).body
    expect(hover.displayString).toContain('count: number')
    expect(hover.start).toMatchObject({ line: bodyLine })
    const param = (
      await s.ask<{ displayString: string; start: { line: number } }>('quickinfo', {
        file,
        line,
        offset: lines[line - 1]!.indexOf('(props') + 2,
      })
    ).body
    expect(param.displayString).toMatch(/props: \{\s+count: number;\s+\}/)
    const diags = (await s.ask('semanticDiagnosticsSync', { file })).body
    expect(diags).toEqual([])
    const shop = lines.findIndex((l) => l.includes('<AddButton')) + 1
    const def = (
      await s.ask<{ start: { line: number; offset: number } }[]>('definition', {
        file,
        line: shop,
        offset: lines[shop - 1]!.indexOf('<AddButton') + 3,
      })
    ).body
    expect(def[0]!.start).toMatchObject({
      line,
      offset: lines[line - 1]!.indexOf('AddButton') + 1,
    })
    const after = lines[bodyLine - 1]!.indexOf('props.count') + 7
    const done = (
      await s.ask<{ entries: { name: string }[] }>('completionInfo', {
        file,
        line: bodyLine,
        offset: after,
      })
    ).body
    expect(done.entries.map((e) => e.name)).toContain('count')

    await verifyEditorEdits({ s, file, lines, bodyLine, shop, dir, line })
  } finally {
    s.child.kill()
  }
}

async function verifyEditorEdits({
  s,
  file,
  lines,
  bodyLine,
  shop,
  dir,
  line,
}: {
  s: ReturnType<typeof tsserver>
  file: string
  lines: string[]
  bodyLine: number
  shop: number
  dir: string
  line: number
}) {
  s.send('change', {
    file,
    line: bodyLine,
    offset: lines[bodyLine - 1]!.indexOf('props.count++') + 1,
    endLine: bodyLine,
    endOffset: lines[bodyLine - 1]!.indexOf('props.count++') + 14,
    insertString: 'props.count.oops()',
  })
  const bad = (await s.ask('semanticDiagnosticsSync', { file })).body
  expect(bad).toMatchObject([{ code: 2339, start: { line: bodyLine } }])

  const card = join(dir, 'src/card.tsx')
  s.send('open', { file: card })
  const w = (await s.ask('semanticDiagnosticsSync', { file: card })).body
  expect(w).toMatchObject([{ code: 9081, start: { line: 1, offset: 17 } }])
  const fix = (
    await s.ask<{ changes: { textChanges: { start: { line: number; offset: number } }[] }[] }[]>(
      'getCodeFixes',
      {
        file: card,
        startLine: 1,
        startOffset: 17,
        endLine: 1,
        endOffset: 21,
        errorCodes: [9081],
      },
    )
  ).body
  expect(fix[0]!.changes[0]!.textChanges[0]!.start).toMatchObject({ line: 1, offset: 27 })

  const rename = (
    await s.ask<{ locs: { locs: { start: { line: number } }[] }[] }>('rename', {
      file,
      line: shop,
      offset: lines[shop - 1]!.indexOf('<AddButton') + 3,
    })
  ).body
  const spots = rename.locs[0]!.locs.map((l) => l.start.line)
  expect(spots).toEqual(expect.arrayContaining([line, shop]))
}

describe('the editor, through the TS server protocol', () => {
  it(
    'hover, diagnostics, go-to-definition, completion, rename and a fix, all at source positions',
    editorTsProtocol,
    120_000,
  )
})
