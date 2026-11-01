import type { Meta } from '@weft/start'
import { Arena } from '../components/Arena'
import { Fix } from '../components/Fix'
import { Go } from '../components/Go'
import { Loom } from '../components/Loom'

export const prerender = true
export const meta: Meta = { title: { absolute: 'weft' }, description: 'TSX compiled to direct DOM bindings. One change, one write.' }

export default function Home() {
  return (
    <>
      <section data-site="hero">
        <div data-part="poster"></div>
        <Loom />
        <h1>weft</h1>
      </section>
      <Arena />
      <Fix />
      <Go />
    </>
  )
}
