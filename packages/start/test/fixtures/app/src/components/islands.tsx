import { Boundary, resource, state, untrack } from '@weft-js/core'

/* @weft client */
export function Counter(props: { start: number; label: string }) {
  const n = state(untrack(() => props.start))
  return <button class="counter" data-label={props.label} onClick={() => { n.value++ }}>{props.label}: {n.value}</button>
}

/**
 * Renders its children: the server's nodes come back when it reopens.
 * @weft client
 */
export function Fold(props: { title: string; children?: unknown }) {
  const open = state(true)
  return (
    <section class="fold">
      <button class="fold-toggle" onClick={() => { open.value = !open.value }}>{props.title}</button>
      {open.value ? <div class="fold-body">{props.children}</div> : null}
    </section>
  )
}

/**
 * Doesn't render its children at first: they wait in a template.
 * @weft client
 */
export function Reveal(props: { children?: unknown }) {
  const on = state(false)
  return <div class="reveal-box"><button class="reveal" onClick={() => { on.value = true }}>reveal</button>{on.value ? props.children : null}</div>
}

function Stock(props: { n: number }) {
  const r = resource(() => Promise.resolve(props.n))
  return <p class="island-stock">In stock: {r.value}</p>
}

/* @weft client */
export function Stocked(props: { n: number }) {
  return <Boundary pending={<p class="island-pending">Loading</p>}><Stock n={props.n} /></Boundary>
}

/**
 * A fragment whose nodes come and go, at the top of a static route.
 * @weft client
 */
export function Many() {
  const on = state(true)
  return <>{on.value ? <b class="many">here</b> : null}<button class="many-toggle" onClick={() => { on.value = !on.value }}>toggle</button></>
}

/** Plain server code, in the same file as the components above. */
export function Label(props: { text: string }) {
  return <em class="label">{props.text}</em>
}

/** Shows its children twice, as warp's frame button shows its label and the sweep's copy. */
/* @weft client */
export function Twice(props: { children?: unknown }) {
  const n = state(0)
  return <button class="twice" onClick={() => n.value++}><b>{props.children}</b><i>{props.children}</i>{n.value}</button>
}
