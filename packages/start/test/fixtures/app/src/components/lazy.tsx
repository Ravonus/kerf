import { Boundary, onMount, resource, state, untrack } from 'weft'
import { Form } from '@weft/start'
import { rename } from '../server/forms'

export function Tap(props: { id: string }) {
  const n = state(0)
  return <button class="tap" data-id={props.id} onClick={() => { n.value++ }}>{props.id}: {n.value}</button>
}

/** Every step a click and keys take, in the order the island saw them. */
export function Log() {
  const seen = state<string[]>([])
  const note = (s: string) => { seen.value = [...untrack(() => seen.value), s] }
  return (
    <div class="log" onFocusIn={() => note('focus')} onKeyDown={e => note(`key:${e.key}`)}>
      <button class="log-a" onPointerDown={() => note('down')} onClick={() => note('a')}>a</button>
      <button class="log-b" onClick={() => note('b')}>b</button>
      <output class="log-out">{seen.value.join(' ')}</output>
    </div>
  )
}

/** A controlled field: its box has to catch up with what was typed before it ran. */
export function Field() {
  const v = state('')
  const on = state(false)
  return (
    <div class="field">
      <input class="field-in" value={v.value} onInput={e => { v.value = (e.target as HTMLInputElement).value }} />
      <input class="field-box" type="checkbox" checked={on.value} onChange={e => { on.value = (e.target as HTMLInputElement).checked }} />
      <output class="field-out">{v.value}|{on.value ? 'on' : 'off'}</output>
    </div>
  )
}

/** Doesn't render its children at first, and they stay the server's. */
export function Unfold(props: { children?: unknown }) {
  const on = state(false)
  return <div><button class="unfold" onClick={() => { on.value = true }}>open</button>{on.value ? props.children : null}</div>
}

export function Named() {
  const done = state('')
  return (
    <div>
      {done.value ? <p class="named">{done.value}</p> : (
        <Form of={rename} class="name-form" onSuccess={(r: any) => { done.value = r.name }}>
          <input class="name-in" name="name" />
          <button class="name-go">Save</button>
        </Form>
      )}
    </div>
  )
}

/** Its own click goes nowhere: a link in an island still has to work when the code is what's slow. */
export function Away() {
  const n = state(0)
  return <a class="away" href="/about" onClick={() => { n.value++ }}>go {n.value}</a>
}

function Stock(props: { n: number }) {
  const r = resource(() => Promise.resolve(props.n))
  return <p class="lazy-stock">In stock: {r.value}</p>
}

/** Reads server data, so it wants to be running once it's seen. */
export function Held(props: { n: number }) {
  return <Boundary pending={<p>Loading</p>}><Stock n={props.n} /></Boundary>
}

/** Starts by itself, but only inside itself. */
export function Seen() {
  const ran = state(false)
  onMount(() => { ran.value = true })
  return <p class="seen">{ran.value ? 'ran' : 'waiting'}</p>
}

/** Starts by itself and reaches past itself: this can't wait, and H010 says so. */
export function Titled() {
  onMount(() => { document.title = 'titled' })
  return <button class="titled" onClick={() => {}}>t</button>
}

export function Auto() {
  const n = state(0)
  return <input class="auto" autofocus onInput={() => { n.value++ }} />
}
