import { Rail } from '../components/rail'

const extras: Record<string, () => unknown> = { one: () => <button class="mixed-bump" onClick={() => {}}>bump</button> }
const pick = (name: string) => extras[name]?.()

function Toc(props: { items: string[] }) {
  return <Rail>{props.items.map(p => <a key={p} class="mixed-link" href={`#${p}`}>{p}</a>)}</Rail>
}

function Pair(props: { first: string }) {
  return <Rail><a class="pair-link" href={`#${props.first}`}>{props.first}</a><b class="pair-b">two</b></Rail>
}

export default function Mixed() {
  return (
    <main>
      {pick('one')}
      <aside><Toc items={['one', 'two', 'three']} /></aside>
      <Pair first="alone" />
    </main>
  )
}
