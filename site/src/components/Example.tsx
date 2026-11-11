import { CheckIcon, CopyIcon } from '@kerf-js/veneer-icons'
import { demos } from '../demos'
import code from '../generated/demos.json'
import '@kerf-js/veneer-core/styles/components/button.css'
import '@kerf-js/veneer-core/styles/components/copy.css'
import '@kerf-js/veneer-core/styles/rich/codeblock.css'
import '../styles/example.css'

/** A live example: what it is, the running result beside its real source, what to try, and why it matters. */
export function Example(props: {
  id: string
  plain?: boolean
  title?: string
  lead?: boolean
  children?: unknown
}) {
  return (
    <section data-site="example" data-lead={props.lead ? '' : undefined}>
      {!props.plain && <h2 data-flow="heading">{props.title ?? demos[props.id]!.title}</h2>}
      <p data-flow="item">{demos[props.id]!.look}</p>
      <div data-part="pair" data-flow="card">
        <div data-part="run">{props.children}</div>
        {/* the kit's frames' copy button, the same markup: SpotlightGate's one copyButtons() listener runs it */}
        <div data-scope="codeblock" data-bare="">
          <div data-part="head">
            <button
              type="button"
              data-scope="button"
              data-emphasis="ghost"
              data-tone="neutral"
              data-size="sm"
              data-act="copy"
              data-copy=""
              aria-label="Copy code"
            >
              <span data-part="indicator">
                <CopyIcon />
                <CheckIcon />
              </span>
            </button>
          </div>
          <div
            data-part="source"
            // oxlint-disable-next-line kerf/no-html-sink -- highlighted at build time from this repo's demos
            innerHTML={(code as Record<string, string>)[props.id]}
          ></div>
        </div>
      </div>
      <dl data-flow="item">
        <div>
          <dt>Try this</dt>
          <dd>{demos[props.id]!.tryIt}</dd>
        </div>
        <div>
          <dt>Why it matters</dt>
          <dd>{demos[props.id]!.why}</dd>
        </div>
      </dl>
    </section>
  )
}
