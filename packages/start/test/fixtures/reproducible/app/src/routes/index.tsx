import { Panel } from 'release-library'

const Waiting = () => <section class="release">Loading</section>
export const skeleton = Waiting

export default function Home() {
  return (
    <section>
      <h1>Release fixture</h1>
      <Panel />
    </section>
  )
}
