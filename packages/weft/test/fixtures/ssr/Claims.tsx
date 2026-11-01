import { Boundary, derived } from 'weft'

export function Lines({ lines }: { lines: string[] }) {
  const n = derived(() => lines)
  return <>{n.value.length === 0 ? <p>none</p> : <div class="lines">{n.value.map(l => <a key={l} href={`/${l}`}>{l}</a>)}</div>}</>
}

export const InBoundary = ({ lines }: { lines: string[] }) => <main><Boundary pending={<p>wait</p>}><Lines lines={lines} /></Boundary></main>

export const Nothing = ({ on }: { on: { value: boolean } }) => <div><b>a</b>{on.value && <i>b</i>}<u>c</u></div>

export const Twice = ({ n }: { n: { value: number } }) => <div><b>a</b>{() => () => n.value}<u>c</u></div>

export function Row({ title, on }: { title: string; on: () => void }) {
  return <button aria-label={title} onClick={on}>{title}</button>
}

export const Wrong = ({ title, on }: { title: string; on: () => void }) => <section><Row title={title} on={on} /><span title={title}>{title}</span></section>

export const Rows = ({ lines }: { lines: string[] }) => <ul>{lines.map(l => <Item key={l} l={l} />)}</ul>

function Item({ l }: { l: string }) {
  return <>{l ? <li>{l}</li> : <li>none</li>}</>
}
