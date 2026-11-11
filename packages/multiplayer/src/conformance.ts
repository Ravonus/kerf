// Plain data in, Checks out: it runs in Node against a real relay, or in a page.

import { state, type Derived } from '@kerf/core'
import type { PeerLink, PeerRoom, PeerTransport } from './index'

/** One requirement of the suite, and how the transport did. */
export interface Check {
  name: string
  ok: boolean
  detail: string
}
type Got = { from: string; text: string }

const settle = async (done: () => boolean, ms = 8000) => {
  for (const end = Date.now() + ms; !done() && Date.now() < end;)
    await new Promise((ok) => {
      setTimeout(ok, 10)
    })
  return done()
}

/** What `transportSuite` needs: a way to build the transport for a peer, and that peer's ticket if it takes one. */
export interface TransportSuiteOptions {
  make: (peer: string) => PeerTransport | Promise<PeerTransport>
  /** A credential for `peer`, as `multiplayer({ ticket })` would hand it. It may be a promise. */
  ticket?: (peer: string) => unknown
}

function fakeRoom(
  self: string,
  ids: Derived<string[]>,
  ticket: unknown,
  wires: Map<string, Set<(from: string, data: unknown) => void>>,
  got: Got[],
): PeerRoom {
  return {
    self,
    ticket,
    peers: {
      get value() {
        return ids.value.filter((p) => p !== self)
      },
    },
    signal: (to, data) => {
      for (const f of wires.get(to) ?? []) queueMicrotask(() => f(self, data))
    },
    onSignal(fn) {
      const set = wires.get(self) ?? new Set()
      wires.set(self, set)
      set.add(fn)
      return () => void set.delete(fn)
    },
    receive: (from, text) => void got.push({ from, text }),
  }
}

/** One Check per requirement of a peer transport. */
export async function transportSuite({ make, ticket }: TransportSuiteOptions): Promise<Check[]> {
  const out: Check[] = []
  const check = (name: string, ok: boolean, detail = '') => void out.push({ name, ok, detail })
  const ids = state(['a', 'b'])
  const wires = new Map<string, Set<(from: string, data: unknown) => void>>()
  const gotA: Got[] = [],
    gotB: Got[] = []
  let a: PeerLink | undefined, b: PeerLink | undefined
  try {
    a = (await make('a')).open(fakeRoom('a', ids, await ticket?.('a'), wires, gotA))
    b = (await make('b')).open(fakeRoom('b', ids, await ticket?.('b'), wires, gotB))
    check(
      'both links come up',
      await settle(() => a!.up.value && b!.up.value, 20_000),
      `${a.up.value} ${b.up.value}`,
    )
    a.send('{"x":1}')
    check(
      'a frame reaches the other peer, named by the transport',
      (await settle(() => gotB.length > 0)) && gotB[0]!.from === 'a' && gotB[0]!.text === '{"x":1}',
      JSON.stringify(gotB[0]),
    )
    await new Promise((ok) => {
      setTimeout(ok, 100)
    })
    check('a frame does not come back to its sender', gotA.length === 0, `${gotA.length}`)
    b.send('{"y":2}')
    check(
      'frames go both ways',
      (await settle(() => gotA.length > 0)) && gotA[0]!.from === 'b',
      JSON.stringify(gotA[0]),
    )
    const before = gotB.length
    a.close()
    a = undefined
    await new Promise((ok) => {
      setTimeout(ok, 100)
    })
    check('a closed link sends nothing', gotB.length === before, `${gotB.length - before}`)
  } catch (e) {
    check('the transport ran', false, String((e as Error | null)?.stack ?? e))
  } finally {
    a?.close()
    b?.close()
  }
  return out
}
