import { rt, type SsrData } from '../index'
import type { RenderOptions, Stream } from '../ssr'

type Pass = (
  code: () => unknown,
  options: RenderOptions,
  cache: SsrData['r'],
  wait: Promise<unknown>[],
  flight: Map<string, Promise<unknown>>,
  stream: Map<string, string>,
  top: Promise<unknown>[],
) => { html: string; data: SsrData }
type Headway = (first: number) => { readonly idle: number; pass(got: number): boolean }
type ChunkOptions = {
  options: RenderOptions & { timeout?: number; passes?: number; landing?: () => string }
  pending: () => string[]
  getGot: () => number
  getWait: () => Promise<unknown>[]
  html: Map<string, string>
  run: () => string
  headway: Headway
}

/**
 * The swap: the template before this script (or `t`) replaces the nodes between its key's markers. No key: drop every
 * marker. A Boundary the client already runs is in `$wh` with what to do instead: it gets the template, and claims its
 * content from that. `$wh` is 0 once the stream is over. An island that wakes on sight and starts with this fallback was
 * being watched by it: gone, it can't be seen, so the content wakes it.
 */
export const SWAP = `$wb=function(k,t){var d=document,h=self.$wh,w=d.createTreeWalker(d.body,128),a,b,n,r=[];if(k&&h&&h[k]){n=h[k];delete h[k];t=t||d.currentScript.previousElementSibling;t.remove();return n(t)}if(!k){self.$wh=0;for(n in h)h[n]()}if(k)t=t||d.currentScript.previousElementSibling;while(n=w.nextNode()){if(!k){if(/^\\/?wb:/.test(n.data))r.push(n)}else if(n.data=='wb:'+k)a=n;else if(n.data=='/wb:'+k){b=n;break}}r.forEach(function(n){n.remove()});if(!a||!b)return;while(a.nextSibling!=b)a.nextSibling.remove();n=a.previousSibling;n=n&&n.data=='['?n.previousSibling:n;b.replaceWith(t.content);a.remove();t.remove();if(n&&/^wi:.*"v"]$/.test(n.data)&&self.__wq&&(n=n.nextElementSibling))__wq.w(n)}`

/**
 * Render with streaming: `shell` now, then a chunk per Boundary whose resources resolve, re-rendering after each
 * settles (cached values, in-flight fetches reused, so nothing is fetched twice). Boundaries that are still pending
 * after `timeout` ms keep their fallbacks, and the client fetches them after hydrating.
 */
export function streamRender(
  code: () => unknown,
  options: RenderOptions & {
    timeout?: number
    passes?: number
    /** Script run just before each chunk's swaps, in the same tag. */ landing?: () => string
  } = {},
  pass: Pass,
  headway: Headway,
): Stream {
  const cache: SsrData['r'] = {}
  const flight = new Map<string, Promise<unknown>>()
  const html = new Map<string, string>()
  let wait: Promise<unknown>[] = []
  let top: Promise<unknown>[] = []
  let last: SsrData | null = null
  let got = 0
  const run = () => {
    html.clear()
    wait = []
    top = []
    const out = pass(code, options, cache, wait, flight, html, top)
    last = out.data
    got = rt.got!
    return out.html
  }
  const pending = () => Object.keys(last?.b ?? {}).filter((k) => last!.b[k] === 'p')
  const chunks = () =>
    streamChunks({ options, pending, getGot: () => got, getWait: () => wait, html, run, headway })
  const stream: Stream = {
    shell: run(),
    chunks: chunks(),
    data: () =>
      last && (Object.keys(last.r).length || Object.keys(last.b).length || last.s) ? last : null,
    async settle() {
      const deadline = Date.now() + (options.timeout ?? 10_000)
      const way = headway(got)
      for (let n = 1; top.length && n < (options.passes ?? 50); n++) {
        let timer: ReturnType<typeof setTimeout> | undefined
        const late = await Promise.race([
          Promise.all(top).then(() => false),
          new Promise<boolean>((ok) => {
            timer = setTimeout(ok, Math.max(0, deadline - Date.now()), true)
          }),
        ])
        clearTimeout(timer)
        if (late) return
        stream.shell = run()
        if (!way.pass(got)) return options.stalled?.()
      }
    },
    async hold(ms) {
      if (ms <= 0) return
      const deadline = Date.now() + ms
      const way = headway(got)
      for (let n = 1; wait.length && pending().length && n < (options.passes ?? 50); n++) {
        let timer: ReturnType<typeof setTimeout> | undefined
        const late = await Promise.race([
          Promise.all(wait).then(() => false),
          new Promise<boolean>((ok) => {
            timer = setTimeout(ok, Math.max(0, deadline - Date.now()), true)
          }),
        ])
        clearTimeout(timer)
        if (late) return
        stream.shell = run()
        if (!way.pass(got)) return
      }
    },
  }
  return stream
}

async function* streamChunks({
  options,
  pending,
  getGot,
  getWait,
  html,
  run,
  headway,
}: ChunkOptions) {
  const deadline = Date.now() + (options.timeout ?? 10_000)
  const open = new Set(pending())
  let defined = false
  const way = headway(getGot())
  for (let n = 1; open.size && getWait().length && n < (options.passes ?? 50); n++) {
    const left = deadline - Date.now()
    if (left <= 0) break
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = await Promise.race([
      // Past a pass that got nowhere: what's left has to land too, so a runaway read isn't why a slow one is given up on.
      (way.idle ? Promise.all(getWait()) : Promise.race(getWait())).then(() => false),
      new Promise<boolean>((ok) => {
        timer = setTimeout(ok, left, true)
      }),
    ])
    clearTimeout(timer)
    if (late) break
    await new Promise((ok) => {
      setTimeout(ok, 0)
    }) // fetches that settle together go out together
    run()
    const going = way.pass(getGot())
    let out = ''
    let first = true
    for (const k of Array.from(open)) {
      const content = html.get(k)
      if (content === undefined) continue
      open.delete(k)
      const id = encodeURIComponent(k)
      out += `<template>${content}</template><script>${defined ? '' : SWAP + ';'}${first ? (options.landing?.() ?? '') : ''}$wb(${JSON.stringify(id)})</script>`
      defined = true
      first = false
    }
    for (const k of pending()) open.add(k) // nested Boundaries inside content that just arrived
    if (out) yield out
    if (!going) {
      options.stalled?.()
      break
    }
  }
  if (open.size)
    yield `<script>${defined ? '' : SWAP + ';'}${options.landing?.() ?? ''}$wb()</script>` // what's left keeps its fallback
}
