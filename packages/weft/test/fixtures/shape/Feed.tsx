// Shape variants for test/shape.test.tsx: a list component in its own module, a row beside it and a page.
import { resource, state, derived, untrack } from '@weft-js/core'
import { Text } from '@weft-js/core/text'
import { Row } from './Row'

export type Post = { id: number; title: string; body: string; pic?: string | undefined }
export const load = (): Promise<Post[]> => new Promise(ok => setTimeout(() => ok([{ id: 1, title: 'One', body: 'Hello' }]), 300))

export function Feed(props: { shape?: Post[] | undefined; effects?: string[] | undefined }) {
  const posts = resource(load, { shape: { of: load, read: () => props.shape } })
  const count = state(0)
  const rows = derived(() => posts.value ?? [])
  untrack(() => props.effects)?.push('setup')
  return (
    <section class="feed" onClick={() => count.value++}>
      <h2 id="title">Posts ({count.value})</h2>
      <ul>{rows.value.map(p => <Row key={p.id} post={p} />)}</ul>
      {posts.value?.length ? <p class="more">More</p> : <p class="empty">Nothing</p>}
      <Text as="h3" class="sum" reserve={40}>{posts.value?.[0]?.title}</Text>
    </section>
  )
}
