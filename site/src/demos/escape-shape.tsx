import { Boundary, resource, state } from '@weft-js/core'
import { Card, Switch } from '@weft-js/warp'
import '@weft-js/warp/skeleton'

type Post = { id: number; title: string; body: string }
// Stands in for a request that takes 1.2 s.
const loadPosts = () =>
  new Promise<Post[]>(done => {
    setTimeout(() => done([
      { id: 1, title: 'Components run once', body: 'And the compiler wires each read to the DOM.' },
      { id: 2, title: 'State is a box', body: 'Read and write it through .value.' },
      { id: 3, title: 'Effects are rare', body: 'Most things are derived.' },
    ]), 1200)
  })

function Feed() {
  const posts = resource(loadPosts)
  return (
    <ul>
      {(posts.value ?? []).map(p => <li key={p.id}><strong>{p.title}</strong>. {p.body}</li>)}
    </ul>
  )
}

export default function Posts() {
  const shown = state(false)
  return (
    <Card title="A skeleton made from the markup">
      <Switch checked={shown.value} onChange={(e: Event & { currentTarget: HTMLInputElement }) => (shown.value = e.currentTarget.checked)}>
        Show the feed
      </Switch>
      {/* The compiler writes a placeholder copy of Feed; the Boundary shows it until the posts arrive. */}
      {shown.value && <Boundary pending="shape"><Feed /></Boundary>}
    </Card>
  )
}
