// A tag that starts at a name the pre-pass rewrites: row parameters, destructured rows, props, rest (test/member-tags.test.tsx).
import { state } from '@kerf/core'

type Part = (props: { class?: string; label?: string; children?: unknown }) => unknown

const part =
  (name: string): Part =>
  (props) => (
    <i class={props.class} data-part={name}>
      {props.label}
    </i>
  )
const Solid = part('solid')
const Line = part('line')
const ns = { Icon: part('ns') }
const box = state({ Icon: part('box') })

export const groups = state([
  { id: 'a', icon: Solid, Icon: Solid, meta: { icon: Line }, slot: { value: Solid } },
  { id: 'b', icon: Line, Icon: Line, meta: { icon: Solid }, slot: { value: Line } },
])
export const swap = () => {
  const [a, b] = groups.value
  groups.value = [{ ...a!, icon: Line }, b!]
}
export const reverse = () => {
  groups.value = [...groups.value].reverse()
}

function FromProps({
  ui,
  Icon,
  Fallback = Line,
  ...rest
}: {
  ui: { Icon: Part }
  Icon: Part
  Fallback?: Part
  extra: { Icon: Part }
}) {
  return (
    <p>
      <ui.Icon label="prop" />
      <Icon label="bare" />
      <Fallback label="default" />
      <rest.extra.Icon label="rest" />
    </p>
  )
}

export function Rows() {
  const local = { Icon: part('local') }
  return (
    <section>
      <ul>
        {groups.value.map((g, i) => (
          <li key={g.id}>
            <g.icon class="x" label={g.id} />
            <g.meta.icon label={`${i}`} />
            <g.slot.value />
            <g.icon class="kids">
              <b>{g.id}</b>
            </g.icon>
            <ns.Icon />
            <local.Icon />
            <box.value.Icon />
          </li>
        ))}
      </ul>
      <ol>
        {groups.value.map(({ id, meta, Icon }) => (
          <li key={id}>
            <meta.icon label={id} />
            <Icon label={id} />
          </li>
        ))}
      </ol>
      <FromProps ui={{ Icon: Solid }} Icon={Line} extra={{ Icon: Solid }} />
    </section>
  )
}
