import { CopyIcon, CheckIcon } from '@kerf/veneer-icons'
import { highlight } from '@kerf/veneer-core'
import './styles'
import '@kerf/veneer-core/styles/components/button.css'
import '@kerf/veneer-core/styles/components/copy.css'
import '@kerf/veneer-core/styles/rich/codeblock.css'
import '@kerf/veneer-core/styles/rich/code-tabs.css'

/** Props for CodeBlock. */
export interface CodeBlockProps {
  /** The source to show, colour and copy. */
  code: string
  /** tsx by default; ts, js, json and sh are coloured too, anything else stays plain. */
  language?: string | undefined
  /** A file name shown in the bar above the code. */
  filename?: string | undefined
  /** Line numbers. */
  lines?: boolean | undefined
  /** Wrap long lines instead of scrolling. */
  wrap?: boolean | undefined
}

function CopyButton({ text }: { text?: string | undefined }) {
  return (
    <button
      type="button"
      data-scope="button"
      data-emphasis="ghost"
      data-tone="neutral"
      data-size="sm"
      data-act="copy"
      data-copy=""
      data-copy-text={text}
      aria-label="Copy code"
    >
      <span data-part="indicator">
        <CopyIcon />
        <CheckIcon />
      </span>
    </button>
  )
}

/**
 * Code, coloured on the server (04 CodeBlock). It has no state, so it hydrates to nothing: `copyButtons()` from
 * `@kerf/veneer-core`, called once anywhere in the app, runs every copy button in the document.
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
      <pre tabindex="0" data-lines={lines ? '' : undefined}>
        <code
          // oxlint-disable-next-line kerf/no-html-sink -- highlight escapes the source before it wraps tokens in spans
          innerHTML={highlight(code, language)}
        ></code>
      </pre>
    </figure>
  )
}

/** Inline code in running text. */
export function Code({ children }: { children: unknown }) {
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
