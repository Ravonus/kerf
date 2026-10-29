// `weft device` for the spike: drive the running app on a simulator, an emulator or the Node fast lane with one set
// of commands, by label, through the real controls. Run from spikes/native/js:
//
//   npx tsx ../scripts/device.mts list
//   npx tsx ../scripts/device.mts <target> <command> [args] [-- <command> [args]]...
//
// targets   ios | ios:<port>          a simulator (its dev socket listens on 127.0.0.1:9301 and up)
//           android | android:<serial> an emulator or device (the CLI runs `adb forward` for you)
//           node:<device id>          the app in the recording host, in a window from protocol/devices.json
// commands  hello | viewport | snapshot [--all] [--json] | find <text> | frames <out.json>
//           tap <label|#id> | type <label|#id> <text> | select <label|#id> <index>
//
// Example: npx tsx ../scripts/device.mts android tap bakery -- tap "Add Bagel 10" -- tap "Cart tab" -- find Total
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { homedir } from 'node:os'
import devices from '../protocol/devices.json'
import { App, seedProducts, type Api } from '../js/src/app'
import { render, type Reply, type Request, type SnapNode, type Snapshot } from '../js/src/device'
import { configure, type OS, type Rect } from '../js/src/platform'
import { RecordingHost } from '../js/src/recording-host'
import { flush, mount } from '../js/src/runtime'

type Send = (req: Request) => Promise<Reply>
const adb = `${process.env.ANDROID_HOME ?? `${homedir()}/Library/Android/sdk`}/platform-tools/adb`

/** One connection, one request in flight at a time, replies matched by order. */
function socket(port: number): Promise<{ send: Send; close(): void }> {
  return new Promise((resolve, reject) => {
    const s: Socket = connect(port, '127.0.0.1')
    let buf = ''
    const waiting: ((r: Reply) => void)[] = []
    s.setEncoding('utf8')
    s.on('data', d => {
      buf += d
      for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) waiting.shift()?.(JSON.parse(buf.slice(0, i)))
    })
    s.once('error', reject)
    s.once('connect', () => resolve({
      send: req => new Promise(r => { waiting.push(r); s.write(JSON.stringify(req) + '\n') }),
      close: () => s.end(),
    }))
  })
}

async function probe(port: number) {
  try {
    const c = await socket(port)
    const hello = await c.send({ cmd: 'hello' })
    c.close()
    return hello.ok ? (hello as unknown as { os: string; device: string }) : null
  } catch { return null }
}

function androidSerials(): string[] {
  try {
    return execFileSync(adb, ['devices'], { encoding: 'utf8' }).split('\n').slice(1).map(l => l.split('\t')).filter(c => c[1] === 'device').map(c => c[0])
  } catch { return [] }
}

/** Forwards a Mac port to the app's dev socket on that device: 9401 for the first device, 9402 for the next... */
function forward(serial: string, index: number): number {
  const port = 9401 + index
  execFileSync(adb, ['-s', serial, 'forward', `tcp:${port}`, 'tcp:9301'])
  return port
}

async function open(target: string): Promise<{ send: Send; close(): void }> {
  const [kind, arg] = target.split(':')
  if (kind === 'ios') {
    for (const p of arg ? [Number(arg)] : Array.from({ length: 10 }, (_, i) => 9301 + i)) if ((await probe(p))?.os === 'ios') return socket(p)
    throw new Error('no iOS app answering on 127.0.0.1:9301-9310 (is a Debug build running in a simulator?)')
  }
  if (kind === 'android') {
    const serials = androidSerials()
    const serial = arg ?? serials[0]
    if (!serial) throw new Error('no Android device in `adb devices`')
    return socket(forward(serial, Math.max(0, serials.indexOf(serial))))
  }
  if (kind === 'node') {
    const d = (devices.devices as { id: string; os: string; w: number; h: number; hinge?: Rect }[]).find(x => x.id === arg)
    if (!d) throw new Error(`node:<id> takes a device from protocol/devices.json: ${devices.devices.map(x => x.id).join(', ')}`)
    configure({ os: d.os as OS })
    const host = new RecordingHost(d.w, d.h)
    host.resize(d.w, d.h, d.hinge)
    const seed = seedProducts(150)
    const api: Api = { listProducts: () => Promise.resolve(structuredClone(seed)), subscribePrices: () => () => {} }
    mount(host, () => App({ api }))
    for (let i = 0; i < 4; i++) await Promise.resolve()
    flush()
    return { send: req => host.dev(req), close() {} }
  }
  throw new Error(`unknown target "${target}": ios, android, node:<device id>`)
}

const ref = (s: string) => (/^#\d+$/.test(s) ? { id: Number(s.slice(1)) } : { label: s })

/**
 * Commands mean the same thing whatever the platform drew. A `Choice` is a segmented control on iOS (pick by index)
 * but a row of chips on Android and web (tap one), so `tap bakery` selects the segment where there is no "bakery"
 * button, and `select Category 2` taps the third chip where there is no segmented control.
 */
async function translate(send: Send, req: Request, error: string): Promise<Request | null> {
  if (!('label' in req) || req.label === undefined) return null
  const snap = await send({ cmd: 'snapshot' })
  if (!snap.ok) return null
  const nodes: SnapNode[] = []
  const walk = (n: SnapNode) => { nodes.push(n); n.children?.forEach(walk) }
  walk((snap as unknown as Snapshot).root)
  if (req.cmd === 'tap' && error.startsWith('no node')) {
    const seg = nodes.find(n => n.type === 'Choice' && n.options?.includes(req.label!))
    if (seg) return { cmd: 'select', id: seg.id, index: seg.options!.indexOf(req.label!) }
  }
  if (req.cmd === 'select' && error.startsWith("can't")) {
    const row = nodes.find(n => n.label === req.label && n.type === 'Row')
    const chip = row?.children?.filter(c => c.type === 'Button')[req.index]
    if (chip) return { cmd: 'tap', id: chip.id }
  }
  return null
}

async function run(send: Send, [cmd, ...args]: string[]): Promise<boolean> {
  const fail = (r: Reply) => { console.error(`✗ ${cmd}: ${r.ok ? '' : r.error}`); return false }
  switch (cmd) {
    case 'hello': case 'viewport': { const r = await send({ cmd }); console.log(JSON.stringify(r)); return r.ok }
    case 'snapshot': case 'find': {
      const r = await send({ cmd: 'snapshot' })
      if (!r.ok) return fail(r)
      if (args.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return true }
      const text = render(r as unknown as Snapshot, args.includes('--all') || cmd === 'find')
      console.log(cmd === 'find' ? text.split('\n').filter(l => l.includes(args[0] ?? '')).map(l => l.trim()).join('\n') : text)
      return true
    }
    case 'frames': {
      const r = await send({ cmd: 'frames' })
      if (!r.ok) return fail(r)
      writeFileSync(args[0] ?? 'frames.json', JSON.stringify(r.frames, null, 2))
      console.log(`wrote ${args[0] ?? 'frames.json'}`)
      return true
    }
    case 'tap': case 'type': case 'select': {
      if (!args[0]) { console.error(`✗ ${cmd} needs a label or #id`); return false }
      const req = (cmd === 'tap' ? { cmd, ...ref(args[0]) } : cmd === 'type' ? { cmd, ...ref(args[0]), text: args[1] ?? '' } : { cmd, ...ref(args[0]), index: Number(args[1]) }) as Request
      let r = await send(req)
      let via = ''
      if (!r.ok) {
        const alt = await translate(send, req, r.error)
        if (alt) { r = await send(alt); via = ` (as ${alt.cmd}: this platform draws "${args[0]}" ${alt.cmd === 'select' ? 'as a segment' : 'as chips'})` }
      }
      if (!r.ok) return fail(r)
      console.log(`✓ ${cmd} #${r.id}${r.visible ? '' : ' (offscreen)'}${via}`)
      return true
    }
  }
  console.error(`✗ unknown command "${cmd}"`)
  return false
}

const argv = process.argv.slice(2)
if (argv[0] === 'list' || !argv.length) {
  for (let p = 9301; p <= 9310; p++) { const h = await probe(p); if (h) console.log(`ios:${p}\t${h.device}`) }
  const serials = androidSerials()
  for (const [i, s] of serials.entries()) {
    const h = await probe(forward(s, i))
    console.log(`android:${s}\t${h ? h.device : '(app not running, or a release build)'}`)
  }
  console.log(`node:<id>\t${devices.devices.length} windows from protocol/devices.json`)
  process.exit(0)
}
const [target, ...rest] = argv
const steps: string[][] = [[]]
for (const a of rest) a === '--' ? steps.push([]) : steps[steps.length - 1].push(a)
const c = await open(target)
let ok = true
for (const s of steps) if (s.length && !(ok = await run(c.send, s))) break
c.close()
process.exit(ok ? 0 : 1)
