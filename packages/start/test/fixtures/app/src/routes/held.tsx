import { Boundary, onMount, resource, state } from '@weft-js/core'
import type { RouteProps } from '@weft-js/start'
import { later } from '../db'

// `?ms=`: how long the Boundaries stay out, so a client can be running when their chunks land. `?ok`: from now on `bad` works.
export const load = async ({ request }: { request: Request }) => {
  const params = new URL(request.url).searchParams
  const ms = Number(params.get('ms') ?? 0)
  if (params.has('ok')) (globalThis as any).__heldOk = true
  const bad = (globalThis as any).__heldOk ? later(ms, 'recovered') : later(ms, 0).then((): string => { throw new Error('no luck') })
  return { late: later(ms, 'landed' + (params.get('tag') ?? '')), bad, inner: later(ms * 2, 'inside') }
}

function Late(props: { v: Promise<string>; inner: Promise<string> }) {
  const r = resource(() => props.v)
  const n = state(0)
  let el: HTMLElement
  onMount(() => void ((globalThis as any).__mounted = el.isConnected && !!el.ownerDocument.defaultView))
  return (
    <section class="late" ref={e => (el = e)}>
      <button class="more" onClick={() => n.value++}>{r.value} {n.value}</button>
      <Boundary pending={<p class="wait-inner">Inner</p>}><Inner v={props.inner} /></Boundary>
    </section>
  )
}

function Inner(props: { v: Promise<string> }) {
  const r = resource(async () => await props.v)
  return <p class="inner">{r.value}</p>
}

function Plain() {
  // Hydration runs a fetcher once to see what it reads, and cancels it: a fetch that isn't cancelled is one that went out.
  const r = resource(async signal => {
    await later(10, 0)
    if (!signal.aborted) (globalThis as any).__plain = ((globalThis as any).__plain ?? 0) + 1
    return 'plain'
  })
  return <p class="plain">{r.value}</p>
}

function Bad(props: { v: Promise<string> }) {
  const r = resource(() => Promise.all([props.v]).then(([v]) => v))
  return <p class="ok">{r.value}</p>
}

export default function Held(props: RouteProps<typeof load>) {
  return (
    <main>
      <a class="same" href="/held?ms=0&tag=2">Same route</a>
      <Boundary pending={<p class="wait-late">Waiting</p>}>
        <Late v={props.data.late} inner={props.data.inner} />
      </Boundary>
      <Boundary pending={<p class="wait-bad">Waiting</p>} error={(e: any, retry) => <div role="alert">{e.message}<button class="again" onClick={retry}>Try again</button></div>}>
        <Bad v={props.data.bad} />
      </Boundary>
      <Boundary pending={<p class="wait-plain">Waiting</p>}>
        <Plain />
      </Boundary>
    </main>
  )
}
