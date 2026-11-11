import { Boundary, state } from '@kerf/core'
import { listPosts } from '../server/feed'

export function Feed(props: { limit: number; seed: number; v: number }) {
  const posts = listPosts(() => ({ limit: props.limit, seed: props.seed, v: props.v }))
  return (
    <ul class="feed" style="list-style:none;margin:0;padding:0">
      {(posts.value ?? []).map((p) => (
        <li key={p.id} class="post" style="padding:8px 0">
          <h3 style="margin:0">{p.title}</h3>
          <p style="margin:4px 0 0">{p.body}</p>
        </li>
      ))}
    </ul>
  )
}

export default function Home() {
  const args = state<{ seed: number; v: number } | null>(null)
  return (
    <main>
      <button id="off" onClick={() => (args.value = null)}>
        Off
      </button>
      <button id="one" onClick={() => (args.value = { seed: 1, v: 1 })}>
        One
      </button>
      <button id="same" onClick={() => (args.value = { seed: 1, v: 2 })}>
        Same payload
      </button>
      <button id="other" onClick={() => (args.value = { seed: 2, v: 1 })}>
        Other payload
      </button>
      {args.value ? (
        <div>
          <Boundary pending="shape">
            <Feed limit={20} seed={args.value.seed} v={args.value.v} />
          </Boundary>
        </div>
      ) : null}
      <footer id="after">After the feed</footer>
    </main>
  )
}
