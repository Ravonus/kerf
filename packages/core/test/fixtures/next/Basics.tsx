// Constructs research 19 step 1 lowers: templates, attributes, class/style, properties, events, text, components,
// fragments, and JSX nested in expressions. next.test.tsx renders them with both back ends and compares.
import { derived, state } from '@kerf/core'

export function Hello() {
  return <p>Hello, world</p>
}

export function Counter() {
  const count = state(0)
  const double = derived(() => count.value * 2)
  return (
    <button onClick={() => count.value++}>
      {count.value} × 2 = {double.value}
    </button>
  )
}

function Badge(props: { tone: string; children?: any }) {
  return <span class={`badge ${props.tone}`}>{props.children}</span>
}

function Pair() {
  return (
    <>
      <i>a</i>
      {'b'}
    </>
  )
}

export function Panel() {
  const open = state(true)
  const name = state('Ada')
  const tone = state('info')
  const width = state(10)
  return (
    <section
      id="panel"
      class={{ open: open.value, panel: true }}
      style={{ width: `${width.value}px` }}
      data-n={3}
      hidden={false}
    >
      <h2 title='a "quoted" title'>Hi, {name.value}!</h2>
      <input
        value={name.value}
        disabled
        onInput={(e) => (name.value = (e.target as HTMLInputElement).value)}
      />
      {open.value ? <Badge tone={tone.value}>on &amp; {name.value}</Badge> : <em>closed</em>}
      <Pair />
      <button type="button" onClick={() => (open.value = !open.value)}>
        toggle
      </button>
      <button type="button" class="wider" onClick={() => (width.value += 5)}>
        wider
      </button>
      <button type="button" class="tone" onClick={() => (tone.value = 'warn')}>
        tone
      </button>
    </section>
  )
}
