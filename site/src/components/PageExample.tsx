import { onCleanup, onMount } from 'weft'
import { render } from 'weft/dom'
import { demos } from '../demos'
import code from '../generated/demos.json'
import '@weft/ui-core/styles/components/badge.css' // what a still shows before its demo's chunk brings them
import '@weft/ui-core/styles/components/surface.css'
import '@weft/ui-core/styles/rich/codeblock.css'
import '../styles/example.css'

const files = import.meta.glob('../demos/*.tsx')

/** The running half: its own chunk, fetched as it nears the screen, so a docs page costs what its text costs. It takes the place of the still beside it. */
/* @weft visible */
function Late(props: { id: string }) {
  let box: HTMLElement | undefined
  onMount(() => {
    let stop: (() => void) | undefined
    let gone = false
    void files[`../demos/${props.id}.tsx`]().then((m: any) => {
      if (gone) return
      box!.previousElementSibling?.remove()
      stop = render(m.default, box!) as () => void
    })
    onCleanup(() => {
      gone = true
      stop?.()
    })
  })
  return <div data-part="run" ref={(n: any) => (box = n)}></div>
}

/** The example a docs page opens with, if it has one. */
export function PageExample(props: { slug: string; stills: Record<string, string> }) {
  return (
    <>
      {Object.keys(demos).filter(id => demos[id].page === props.slug).map(id => (
        <section key={id} data-site="example">
          <p>{demos[id].look}</p>
          <div data-part="pair">
            <div data-part="run" inert innerHTML={props.stills[id]}></div>
            <Late id={id} />
            <div data-scope="codeblock" innerHTML={code[id]}></div>
          </div>
          <dl>
            <div><dt>Try this</dt><dd>{demos[id].tryIt}</dd></div>
            <div><dt>Why it matters</dt><dd>{demos[id].why}</dd></div>
          </dl>
        </section>
      ))}
    </>
  )
}
