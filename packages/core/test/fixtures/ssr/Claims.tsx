import { Boundary, derived } from '@weft-js/core'

export function Lines({ lines }: { lines: string[] }) {
  const n = derived(() => lines)
  return (
    <>
      {n.value.length === 0 ? (
        <p>none</p>
      ) : (
        <div class="lines">
          {n.value.map((l) => (
            <a key={l} href={`/${l}`}>
              {l}
            </a>
          ))}
        </div>
      )}
    </>
  )
}

export const InBoundary = ({ lines }: { lines: string[] }) => (
  <main>
    <Boundary pending={<p>wait</p>}>
      <Lines lines={lines} />
    </Boundary>
  </main>
)

export const Nothing = ({ on }: { on: { value: boolean } }) => (
  <div>
    <b>a</b>
    {on.value && <i>b</i>}
    <u>c</u>
  </div>
)

export const Twice = ({ n }: { n: { value: number } }) => (
  <div>
    <b>a</b>
    {() => () => n.value}
    <u>c</u>
  </div>
)

export function Row({ title, on }: { title: string; on: () => void }) {
  return (
    <button aria-label={title} onClick={on}>
      {title}
    </button>
  )
}

export const Wrong = ({ title, on }: { title: string; on: () => void }) => (
  <section>
    <Row title={title} on={on} />
    <span title={title}>{title}</span>
  </section>
)

export const Rows = ({ lines }: { lines: string[] }) => (
  <ul>
    {lines.map((l) => (
      <Item key={l} l={l} />
    ))}
  </ul>
)

function Item({ l }: { l: string }) {
  return <>{l ? <li>{l}</li> : <li>none</li>}</>
}

export const Keyed = ({ rows }: { rows: { id: any; href: string; t: string }[] }) => (
  <div>
    {rows.map((r) => (
      <a key={r.id} href={r.href}>
        {r.t}
      </a>
    ))}
  </div>
)

export const Holes = ({ on, b }: { on: { value: boolean }; b: { value: string } }) => (
  <p>
    {on.value ? (
      <>
        one<i>i</i>
        {b.value}
      </>
    ) : null}
    <u>c</u>
  </p>
)

export const Beside = ({ on }: { on: () => void }) => (
  <section>
    {
      <>
        x<Row title="a" on={on} />
      </>
    }
    <b>b</b>
    <Row title="c" on={on} />
  </section>
)

/** A spread input, the way a component library passes its props through. */
export const Check = (props: { on: { value: boolean }; title: string }) => {
  const rest = () => ({ type: 'checkbox', checked: props.on.value, 'data-title': props.title })
  return (
    <label>
      <input {...rest()} />
      {props.title}
    </label>
  )
}

/** The same input with its props written straight on it. */
export const CheckDirect = (props: { on: { value: boolean }; title: string }) => (
  <input type="checkbox" checked={props.on.value} data-title={props.title} />
)
