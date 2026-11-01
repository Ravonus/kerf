import { demos } from '../demos'
import code from '../generated/demos.json'
import '@weft/ui-core/styles/rich/codeblock.css'
import '../styles/example.css'

function Run(props: { id: string }) {
  return <>{demos[props.id].run()}</>
}

/** A live example: what it is, the running result beside its real source, what to try, and why it matters. */
export function Example(props: { id: string; plain?: boolean }) {
  return (
    <section data-site="example">
      {!props.plain && <h3>{demos[props.id].title}</h3>}
      <p>{demos[props.id].look}</p>
      <div data-part="pair">
        <div data-part="run"><Run id={props.id} /></div>
        <div data-scope="codeblock" innerHTML={code[props.id]}></div>
      </div>
      <dl>
        <div><dt>Try this</dt><dd>{demos[props.id].tryIt}</dd></div>
        <div><dt>Why it matters</dt><dd>{demos[props.id].why}</dd></div>
      </dl>
    </section>
  )
}
