// Research 19 step 2 constructs: conditionals over JSX, element spreads, refs, <select value> over a list, SVG
// and namespaced attributes. Only weft's back end compiles some of these (Solid's has no `spread` here).
import { state } from '@weft-js/core'

export function Toggle() {
  const n = state(0)
  const on = state(true)
  return (
    <div>
      <button class="inc" onClick={() => n.value++}>+</button>
      <button class="flip" onClick={() => (on.value = !on.value)}>flip</button>
      {on.value ? <b>on {n.value}</b> : <i>off</i>}
      {n.value > 1 && <u>many</u>}
    </div>
  )
}

export function Spread(props: { rest: Record<string, any>; tone: string }) {
  return (
    <a id="first" {...props.rest} data-tone={props.tone} title="fixed">
      link
    </a>
  )
}

export function Refs(props: { seen: (el: Element) => void }) {
  let box: HTMLDivElement | undefined
  const read = () => box?.id
  return (
    <section>
      <div id="box" ref={box} />
      <span ref={props.seen} />
      <output>{read()}</output>
    </section>
  )
}

export function Picker() {
  const options = state(['a', 'b', 'c'])
  const picked = state('b')
  return (
    <select value={picked.value} onChange={e => (picked.value = e.currentTarget.value)}>
      {options.value.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Dot(props: { r: number }) {
  return <circle cx="5" cy="5" r={props.r} />
}

export function Icon() {
  const r = state(2)
  return (
    <svg viewBox="0 0 10 10" onClick={() => r.value++}>
      <Dot r={r.value} />
      <use xlink:href="#dot" />
    </svg>
  )
}

/** Content properties and a spread's `children` (no JSX children): rendered on the server, adopted on hydration. */
export function Content(props: { rest: Record<string, any> }) {
  const n = state(1)
  return (
    <section>
      <p class="text" textContent={`a <b> & ${n.value}`} />
      <div class="html" innerHTML={`<i>${n.value}</i>`} />
      <div class="kids" {...props.rest} />
      <button onClick={() => n.value++}>+</button>
    </section>
  )
}
