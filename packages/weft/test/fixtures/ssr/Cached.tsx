// resource(…, { data: false }) for test/async.test.tsx: the caller's cache transfers the value, not the page data.
import { resource } from 'weft'

export type Read = (id: string) => { name: string } | Promise<{ name: string }>

export function Cached(props: { read: Read }) {
  const user = resource(() => props.read('u1'), { data: false })
  return <p class="cached">{user.value?.name}</p>
}
