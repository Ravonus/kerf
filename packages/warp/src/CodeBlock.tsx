import { CopyIcon, CheckIcon } from '@weft/icons'
import { highlight } from '@weft/warp-core'
import './styles'
import '@weft/warp-core/styles/components/button.css'
import '@weft/warp-core/styles/components/copy.css'
import '@weft/warp-core/styles/rich/codeblock.css'
import '@weft/warp-core/styles/rich/code-tabs.css'

export interface CodeBlockProps {
  code: string
  /** tsx by default; ts, js, json and sh are coloured too, anything else stays plain. */
  language?: string
  filename?: string
  /** Line numbers. */
  lines?: boolean
  /** Wrap long lines instead of scrolling. */
  wrap?: boolean
}

function CopyButton({ text }: { text?: string }) {
  return (
    <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-size="sm" data-act="copy" data-copy="" data-copy-text={text} aria-label="Copy code">
      <span data-part="indicator"><CopyIcon /><CheckIcon /></span>
    </button>
  )
}

/**
 * Code, coloured on the server (04 CodeBlock). It has no state, so it hydrates to nothing: `copyButtons()` from
 * `@weft/warp-core`, called once anywhere in the app, runs every copy button in the document.
 */
export function CodeBlock({ code, language = 'tsx', filename, lines, wrap }: CodeBlockProps) {
  return (
    <figure data-scope="codeblock" data-wrap={wrap ? '' : undefined}>
      <div data-part="head">
        {filename && <span data-part="file">{filename}</span>}
        <span class="sp"></span>
        <span data-part="lang">{language}</span>
        <CopyButton />
      </div>
      <pre tabindex="0" data-lines={lines ? '' : undefined}><code innerHTML={highlight(code, language)}></code></pre>
    </figure>
  )
}

/** Inline code in running text. */
export function Code({ children }: { children: any }) {
  return <code data-scope="code">{children}</code>
}

/** One command to copy, with its `$` (04 Snippet). */
export function Snippet({ code, prompt = '$' }: { code: string; prompt?: string }) {
  return (
    <div data-scope="snippet">
      <span aria-hidden="true">{prompt}</span>
      <code>{code}</code>
      <CopyButton text={code} />
    </div>
  )
}
