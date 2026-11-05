import { StartError } from '../data'
import type { Native, NativeOptions } from '../rust'
import {
  DEFAULT_TIMEOUT,
  callContext,
  defaultClaims,
  encoder,
  env,
  nodeHost,
  settled,
  wire,
} from './common'

const NAME = /^[a-z][a-z0-9_-]*$/

// ---- native ---------------------------------------------------------------------------------------------------------

/** The exports a `.wasm` built by the crate has. */
interface Wasm {
  memory: WebAssembly.Memory
  weft_init: () => void
  weft_free: (ptr: number, len: number) => void
  weft_alloc: (len: number) => number
  weft_contract: () => bigint
  weft_call: (i: number, il: number, c: number, cl: number, b: number, bl: number) => bigint
}
interface Engine {
  kind: 'addon' | 'wasm'
  call(id: string, ctx: string, body: string): Promise<string> | string
}
interface Entry {
  kind?: string
  hash: string
  addon?: string
  wasm?: string
  failure?: string
}

interface ReadFile {
  (file: string, encoding: 'utf8'): string
  (file: string): Uint8Array<ArrayBuffer>
}
interface Builtins {
  'node:fs': { existsSync(file: string): boolean; readFileSync: ReadFile }
  'node:path': { dirname(path: string): string; join(...parts: string[]): string }
  'node:url': { fileURLToPath(url: string): string }
}
const builtin = <K extends keyof Builtins>(name: K) =>
  nodeHost.process?.getBuiltinModule?.(name) as Builtins[K] | undefined
const platform = () => {
  const p = nodeHost.process
  return `${p?.platform}-${p?.arch}`
}

/** `.output/server/rust/` from wherever the bundle put this code. `WEFT_NATIVE_DIR` is `weft dev`'s, and `weft build`'s. */
function nativeDir(origin: string): string | undefined {
  const fs = builtin('node:fs'),
    path = builtin('node:path')!,
    url = builtin('node:url')!
  if (!fs) return undefined
  const set = env('WEFT_NATIVE_DIR')
  if (set) return set
  let dir = path.dirname(url.fileURLToPath(origin))
  for (let i = 0; i < 6; i++, dir = path.dirname(dir))
    if (fs.existsSync(path.join(dir, 'rust', 'manifest.json'))) return path.join(dir, 'rust')
  return undefined
}

function addonEngine(file: string, hash: string, target: string): Engine {
  const mod = { exports: {} as { contract: () => string; call: Engine['call'] } }
  nodeHost.process!.dlopen(mod, file)
  const built = JSON.parse(mod.exports.contract())
  if (built.hash !== hash)
    throw new StartError(
      'R103',
      `\`${target}\`'s library was built from contract ${built.hash}, and this app's is ${hash}`,
      'rebuild it: `weft build`',
      { status: 502 },
    )
  return { kind: 'addon', call: mod.exports.call }
}

/**
 * The same functions as a `.wasm`, on this thread. A panic traps, which ends an instance: what it said arrives first,
 * and the next call gets a new one, as a sidecar's crash gets a restart.
 */
async function wasmEngine(file: string, hash: string, target: string): Promise<Engine> {
  const module = await WebAssembly.compile(builtin('node:fs')!.readFileSync(file))
  const decoder = new TextDecoder()
  let said = ''
  let x: Wasm | undefined
  const text = (ptr: number, len: number) =>
    decoder.decode(new Uint8Array(x!.memory.buffer, ptr, len))
  const fresh = () => {
    x = new WebAssembly.Instance(module, {
      weft: {
        now: () => performance.now(),
        panicked: (ptr: number, len: number) => {
          said = text(ptr, len)
        },
      },
    }).exports as unknown as Wasm
    x.weft_init()
  }
  const taken = (packed: bigint) => {
    const ptr = Number(packed >> 32n),
      len = Number(packed & 0xffffffffn)
    const out = text(ptr, len)
    x!.weft_free(ptr, len)
    return out
  }
  const put = (s: string): [number, number] => {
    const bytes = encoder.encode(s)
    const ptr = x!.weft_alloc(bytes.length)
    new Uint8Array(x!.memory.buffer, ptr, bytes.length).set(bytes)
    return [ptr, bytes.length]
  }
  fresh()
  const built = JSON.parse(taken(x!.weft_contract()))
  if (built.hash !== hash)
    throw new StartError(
      'R103',
      `\`${target}\`'s library was built from contract ${built.hash}, and this app's is ${hash}`,
      'rebuild it: `weft build`',
      { status: 502 },
    )
  return {
    kind: 'wasm',
    call(id, ctx, body) {
      if (!x) fresh()
      const [i, il] = put(id),
        [c, cl] = put(ctx),
        [b, bl] = put(body)
      try {
        const reply = taken(x!.weft_call(i, il, c, cl, b, bl))
        x!.weft_free(i, il)
        x!.weft_free(c, cl)
        return reply
      } catch (e) {
        if (!(e instanceof WebAssembly.RuntimeError)) throw e
        x = undefined
        return JSON.stringify({
          ok: false,
          error: {
            code: 'Internal',
            requestId: JSON.parse(ctx).requestId,
            detail: said || e.message,
          },
        })
      }
    },
  }
}

async function load(dir: string, entry: Entry, target: string): Promise<Engine> {
  const fs = builtin('node:fs')!,
    path = builtin('node:path')!
  const addon = entry.addon && path.join(dir, entry.addon)
  if (addon && fs.existsSync(addon)) {
    try {
      return addonEngine(addon, entry.hash, target)
    } catch (e) {
      if (e instanceof StartError) throw e
      console.warn(
        `[weft] ${target}: the addon didn't load here (${String((e as { message?: unknown }).message).split('\n')[0]})${entry.wasm ? ': using its WASM' : ''}`,
      )
    }
  }
  if (entry.wasm) return wasmEngine(path.join(dir, entry.wasm), entry.hash, target)
  throw new StartError(
    'R104',
    `\`${target}\` has no addon for ${platform()} and no WASM`,
    'build on this platform, drop `wasm: false` from `rust.services`, or use `remote()`',
    { status: 503 },
  )
}

function engineFor(name: string, target: string, origin: string) {
  let loaded: Promise<Engine> | undefined, stamp: string | undefined

  /** The engine for now. Under `weft dev` a rebuild is a new file: the next call loads it, and calls on the old one finish. */
  function engine(): Promise<Engine> {
    const fs = builtin('node:fs')!,
      path = builtin('node:path')!
    const dir = nativeDir(origin)
    if (!dir)
      throw new StartError(
        'R104',
        `\`${target}\` has nothing to load here`,
        'this runtime has no file system, or the build has no `rust/` folder: use `remote()`, or run `weft build`',
        { status: 503 },
      )
    const file = path.join(dir, 'manifest.json')
    const watching = !!env('WEFT_NATIVE_DIR')
    // Its text, not its mtime: two writes can land in one tick of a coarse clock.
    const text: string | undefined =
      watching && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined
    if (loaded && text === stamp) return loaded
    const entry: Entry | undefined = fs.existsSync(file)
      ? JSON.parse(text ?? fs.readFileSync(file, 'utf8'))[name]
      : undefined
    if (!entry)
      throw new StartError(
        'R104',
        `\`${target}\` isn't in this build`,
        'run `weft build`, or check `crates/' + name + '`',
        { status: 503 },
      )
    if (entry.failure)
      throw new StartError(
        'R103',
        `\`${target}\` didn't build: ${entry.failure}`,
        'fix the crate: `weft dev` retries on every edit',
        { status: 503 },
      )
    stamp = text
    const held = loaded
    const next = load(dir, entry, target)
    // A bad build keeps what was serving, as a sidecar's does.
    loaded = next.catch((e) => {
      if (held) {
        loaded = held
        return held
      }
      loaded = undefined
      throw e
    })
    return loaded
  }

  return engine
}

/**
 * A Rust library implementing the functions that point at it, in this process, as `impl: media`. An addon runs each call
 * on the worker pool, so the event loop stays free; where one can't load, its `.wasm` runs them on this thread. Either
 * way the declaration, the client and the caches are the same as for `run`.
 */
export function createNative(name: string, options: NativeOptions, origin: string): Native {
  if (!NAME.test(name))
    throw new StartError(
      'R104',
      `\`native('${name}')\` isn't a service name`,
      "`native('media')`, for the crate at `crates/media`",
    )
  const { timeout = DEFAULT_TIMEOUT, claims = defaultClaims, validate = true } = options
  const target = `native('${name}')`
  // Before the pool's first use: its default of 4 is a ceiling on calls at once that an app would never think to raise.
  const proc = nodeHost.process
  if (proc?.env && !proc.env.UV_THREADPOOL_SIZE)
    proc.env.UV_THREADPOOL_SIZE = String(
      Math.max(4, globalThis.navigator?.hardwareConcurrency ?? 4),
    )

  const engine = engineFor(name, target, origin)

  return {
    kind: 'native',
    target: `native://${name}`,
    service: name,
    engine: async () => (await engine()).kind,
    async call({ fn, input, ctx, request }) {
      const context = JSON.stringify(callContext(fn, ctx, request, timeout, claims))
      const body = JSON.stringify({ input: (await wire(fn, input)) ?? null })
      const running = (await engine()).call(fn.$id, context, body)
      let timer: ReturnType<typeof setTimeout> | undefined
      const reply =
        typeof running === 'string'
          ? running
          : await Promise.race([
              running,
              new Promise<string>((ok) => {
                timer = setTimeout(ok, timeout, '{"ok":false,"error":{"code":"Deadline"}}')
              }),
            ])
      clearTimeout(timer)
      return settled(fn, JSON.parse(reply), target, timeout, validate)
    },
  }
}
