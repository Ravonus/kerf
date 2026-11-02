import { demos } from '../demos'
import code from '../generated/demos.json'
import '@weft/warp-core/styles/rich/codeblock.css'
import '../styles/example.css'

/** A live example: what it is, the running result beside its real source, what to try, and why it matters. */
export function Example(props: { id: string; plain?: boolean; title?: string; lead?: boolean; children?: unknown }) {
  return (
    <section data-site="example" data-flow="card" data-lead={props.lead ? '' : undefined}>
      {!props.plain && <h2 data-flow="heading">{props.title ?? demos[props.id].title}</h2>}
      <p>{demos[props.id].look}</p>
      <div data-part="pair">
        <div data-part="run">{props.children}</div>
        <div data-scope="codeblock" innerHTML={code[props.id]}></div>
      </div>
      <dl>
        <div><dt>Try this</dt><dd>{demos[props.id].tryIt}</dd></div>
        <div><dt>Why it matters</dt><dd>{demos[props.id].why}</dd></div>
      </dl>
    </section>
  )
}
