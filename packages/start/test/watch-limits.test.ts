// Where the environment limits file watchers (a sandbox, a busy machine), `fs.watch` fails with EMFILE: a one-shot
// command like `kerf check` must not watch at all, and dev must carry on without the watcher, not crash on an
// unhandled FSWatcher 'error'.
import { EventEmitter } from 'node:events'
import type * as Fs from 'node:fs'
import { createLogger, createServer } from 'vite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixture as root, site } from './dev-server.setup.mjs'

// Every `fs.watch` Start opens fails the way a limited environment fails it: an 'error' event after it starts.
const watch = vi.hoisted(() => vi.fn())
vi.mock('node:fs', async (original) => ({ ...(await original<typeof Fs>()), watch }))

const { routesMeta } = await import('../src/inspect.mjs')
const { default: kerfStart } = await import('../src/vite.mjs')
const { watchTree } = await import('../src/watch-tree.mjs')

const emfile = () =>
  Object.assign(new Error('EMFILE: too many open files, watch'), {
    code: 'EMFILE',
    errno: -24,
    syscall: 'watch',
  })
beforeEach(() => {
  watch.mockReset().mockImplementation(() => {
    const w = Object.assign(new EventEmitter(), { close: vi.fn() })
    setTimeout(() => w.emit('error', emfile()), 0)
    return w
  })
})
const settle = () =>
  new Promise((ok) => {
    setTimeout(ok, 20)
  })

describe('a watcher the environment refuses', () => {
  it("`kerf check`'s route inspection opens none", async () => {
    const r = await routesMeta({ root, site })
    await settle()
    expect(r.routes.map((x) => x.path)).toContain('/')
    expect(watch).not.toHaveBeenCalled()
  })

  it('leaves the dev server running, with a warning that says why', async () => {
    const logger = createLogger('silent')
    const warned: string[] = []
    logger.warn = (msg) => void warned.push(msg)
    const server = await createServer({
      root,
      configFile: false,
      customLogger: logger,
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false },
      plugins: [kerfStart({ root })],
    })
    try {
      await settle()
      expect(watch).toHaveBeenCalled()
      expect(warned.join('\n')).toMatch(/can't watch src\/ \(EMFILE\)/)
    } finally {
      await server.close()
    }
  })

  it('is closed after its error, and one that cannot start gives null', () => {
    const warn = vi.fn()
    const w = watchTree(root, () => {}, warn) as unknown as EventEmitter & { close: () => void }
    w.emit('error', emfile())
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ code: 'EMFILE' }))
    expect(w.close).toHaveBeenCalled()
    watch.mockImplementationOnce(() => {
      throw emfile()
    })
    expect(watchTree(root, () => {}, warn)).toBeNull()
  })
})
