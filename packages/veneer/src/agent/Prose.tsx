import {
  parseInline,
  parseText,
  type AgentSource,
  type Inline,
  type TextBlock,
} from '@kerf/veneer-core'
import { derived, untrack } from '@kerf/core'
import { Cite } from './Cite'
import '../styles'
import '@kerf/veneer-core/styles/app/assistant.css'

function Cited({ n, sources, base }: { n: number; sources: AgentSource[]; base: string }) {
  const source = derived(() => sources[n - 1])
  return <Cite n={n} source={source.value} href={`#${base}-s${n}`} />
}

type Mark = Extract<Inline, { kind: 'cite' }>
type Run = Exclude<Inline, Mark>
type Para = Extract<TextBlock, { kind: 'p' }>
type List = Extract<TextBlock, { kind: 'ul' }>
type Fence = Extract<TextBlock, { kind: 'code' }>

function Span({ part, sources, base }: { part: Inline; sources: AgentSource[]; base: string }) {
  const kind = derived(() => part.kind)
  const view = derived(() => {
    const k = kind.value
    return untrack(() =>
      k === 'cite' ? (
        <Cited n={(part as Mark).n} sources={sources} base={base} />
      ) : k === 'code' ? (
        <code>{(part as Run).text}</code>
      ) : (
        <span>{(part as Run).text}</span>
      ),
    )
  })
  return <>{view.value}</>
}

function Spans({ text, sources, base }: { text: string; sources: AgentSource[]; base: string }) {
  const parts = derived<Inline[]>(() => parseInline(text))
  return (
    <>
      {parts.value.map((p) => (
        <Span key={p.at} part={p} sources={sources} base={base} />
      ))}
    </>
  )
}

function Block({
  block,
  sources,
  base,
}: {
  block: TextBlock
  sources: AgentSource[]
  base: string
}) {
  const kind = derived(() => block.kind)
  // a block that changes kind (a paragraph becoming a list) rebuilds; one that only grows is patched
  const view = derived(() => {
    const k = kind.value
    return untrack(() => {
      if (k === 'p')
        return (
          <p>
            <Spans text={(block as Para).text} sources={sources} base={base} />
          </p>
        )
      if (k === 'ul')
        return (
          <ul>
            {(block as List).items.map((i) => (
              <li key={i.at}>
                <Spans text={i.text} sources={sources} base={base} />
              </li>
            ))}
          </ul>
        )
      return (
        <pre
          role="group"
          tabindex="0"
          aria-label={(block as Fence).lang ? `Code, ${(block as Fence).lang}` : 'Code'}
        >
          <code>{(block as Fence).text}</code>
        </pre>
      )
    })
  })
  return <>{view.value}</>
}

/**
 * Answer text, the safe default until Veneer has Markdown: paragraphs, `- ` lists, code fences (open ones already render
 * as code), inline code and `[n]` cites. Text only: nothing in the model's output becomes markup. Blocks are keyed by
 * where they start, so streaming patches the last one in place.
 */
export function Prose({
  text,
  sources = [],
  base = 'src',
}: {
  text: string
  sources?: AgentSource[]
  base?: string
}) {
  const blocks = derived(() => parseText(text))
  return (
    <>
      {blocks.value.map((b) => (
        <Block key={b.at} block={b} sources={sources} base={base} />
      ))}
    </>
  )
}
