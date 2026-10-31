// The client side of the exit check. It is never edited: the swap from a TS `run` to a Rust sidecar leaves this file,
// and every byte built from it, as they were.
import { state } from 'weft'
import { Boundary } from 'weft'
import type { LoadArgs, Meta } from '@weft/start'
import { addDoc, getDoc, popular, searchDocs } from '../server/docs'

export const load = async (_: LoadArgs) => ({ top: (await popular.fetch({ limit: 3 })).map(d => d.title) })

export const meta: Meta<typeof load> = ({ data }) => ({ title: `Search (${data.top.length})` })

function Hits(props: { q: string }) {
  const hits = searchDocs(() => ({ q: props.q, limit: 5 }))
  return (
    <ul class="hits">
      {(hits.value ?? []).map(h => (
        <li key={h.id}>{h.title} <small>{h.score}</small></li>
      ))}
    </ul>
  )
}

export default function Search(props: { data: { top: string[] } }) {
  const q = state('lantern')
  const title = state('')
  const missing = state('')
  const open = () => getDoc.fetch({ id: 'no-such-doc' }).catch((e: { code?: string; data?: { id: string } }) => { missing.value = `${e.code}:${e.data?.id}` })
  return (
    <main>
      <h1>Search</h1>
      <p class="top">{props.data.top.join(', ')}</p>
      <input aria-label="Search" value={q.value} onInput={e => { q.value = (e.target as HTMLInputElement).value }} />
      <Boundary pending={<p class="busy">Searching</p>} error={e => <p role="alert">{String((e as Error).message)}</p>}>
        <Hits q={q.value} />
      </Boundary>
      <input aria-label="Title" value={title.value} onInput={e => { title.value = (e.target as HTMLInputElement).value }} />
      <button class="add" onClick={() => addDoc({ title: title.value, body: `About ${title.value}` })}>Add</button>
      <button class="open" onClick={open}>Open</button>
      <output>{missing.value}</output>
    </main>
  )
}
