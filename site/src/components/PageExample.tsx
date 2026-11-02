import Later from '../demos/async'
import Lists from '../demos/lists'
import Props from '../demos/props'
import Rules from '../demos/rules'
import UiState from '../demos/ui-state'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '../styles/example.css'

/** What the route's loader sends for one example; none of it is in the page's script. */
export type PageExampleData = { id: string; look: string; tryIt: string; why: string; code: string }

/**
 * One JSX site per demo: each is then an island the server renders, and a press before its code has loaded is held and
 * replayed, like any other island's.
 */
function Demo(props: { id: string }) {
  return (
    <div data-part="run">
      {props.id === 'rules' && <Rules />}
      {props.id === 'props' && <Props />}
      {props.id === 'lists' && <Lists />}
      {props.id === 'async' && <Later />}
      {props.id === 'ui-state' && <UiState />}
    </div>
  )
}

/** The examples a docs page opens with, if it has any. */
export function PageExample(props: { examples: PageExampleData[] }) {
  return (
    <>
      {props.examples.map(e => (
        <section key={e.id} data-site="example">
          <p>{e.look}</p>
          <div data-part="pair">
            <Demo id={e.id} />
            <div data-scope="codeblock" innerHTML={e.code}></div>
          </div>
          <dl>
            <div><dt>Try this</dt><dd>{e.tryIt}</dd></div>
            <div><dt>Why it matters</dt><dd>{e.why}</dd></div>
          </dl>
        </section>
      ))}
    </>
  )
}
