import { CopyIcon } from '@weft-js/warp-icons'
import { announce, copyText } from '@weft-js/warp-core'
import { Button } from '../../Button'
import { derived, untrack } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'

const X = [8, 27.5, 47, 66.5, 86, 105.5, 125].map((x) => ({ x }))
const Threads = ({ y2 = 84 }: { y2?: number }) => (
  <>
    {X.map((t) => (
      <line key={t.x} x1={t.x} y1="0" x2={t.x} y2={y2} />
    ))}
  </>
)

/** 404 and 500: a weft thread broken in two. */
export const Broken = () => (
  <svg data-part="weave" viewBox="0 0 132 84" preserveAspectRatio="none" aria-hidden="true">
    <Threads />
    <path pathLength="1" style="--i:0" d="M0 22H132" />
    <path pathLength="1" style="--i:1" d="M0 44H70" data-broken="" />
    <path pathLength="1" style="--i:2" d="M86 44H132" opacity=".35" />
    <path pathLength="1" style="--i:3" d="M0 64H132" />
  </svg>
)
/** First run: whole threads. */
export const Whole = () => (
  <svg data-part="weave" viewBox="0 0 132 84" preserveAspectRatio="none" aria-hidden="true">
    <Threads />
    <path pathLength="1" style="--i:0" d="M0 22H132" />
    <path pathLength="1" style="--i:1" d="M0 44H132" />
    <path pathLength="1" style="--i:2" d="M0 64H132" />
  </svg>
)
/** 403: a thread stops at a padlock on the crossing, in ink: nothing broke (07 §6.5). */
export const Locked = () => (
  <svg
    data-part="weave"
    viewBox="0 0 132 84"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    {[16, 36, 56, 76, 96, 116].map((x) => (
      <line key={x} x1={x} y1="4" x2={x} y2="80" />
    ))}
    <path pathLength="1" style="--i:0" d="M4 22 C 30 18, 40 26, 66 22 S 102 18, 128 22" />
    <path pathLength="1" style="--i:1" d="M4 62 C 30 58, 40 66, 66 62 S 102 58, 128 62" />
    <path pathLength="1" style="--i:2" d="M4 42 C 20 40, 34 44, 52 42" />
    <path data-part="shackle" d="M58 40 v-7 a8 8 0 0 1 16 0 v7" />
    <rect data-part="lock" x="54" y="39" width="24" height="19" rx="4" />
    <path data-part="keyhole" d="M66 46 v5" />
  </svg>
)

const focusTitle = (el: HTMLElement) => {
  el.focus({ preventScroll: true })
  return { update() {}, destroy() {} }
}

/** The title and code: every result page's top. */
export function Head({
  art,
  code,
  title,
  focus,
  as,
}: {
  art: unknown
  code: unknown
  title: unknown
  focus?: boolean | undefined
  as?: 'h2' | 'h3' | undefined
}) {
  const h3 = derived(() => as === 'h3')
  let el: HTMLElement | undefined
  if (untrack(() => focus)) use(focusTitle, () => el)
  return (
    <>
      <span data-part="art">{art}</span>
      <span data-part="code">{code}</span>
      {h3.value ? (
        <h3 ref={(n) => (el = n)} data-part="title" tabindex="-1">
          {title}
        </h3>
      ) : (
        <h2 ref={(n) => (el = n)} data-part="title" tabindex="-1">
          {title}
        </h2>
      )}
    </>
  )
}

export function RequestId({ id }: { id: string }) {
  return (
    <span data-part="meta">
      Request ID <code>{id}</code>
      <Button
        emphasis="ghost"
        tone="neutral"
        size="sm"
        data-icon-only=""
        label="Copy request ID"
        onClick={async () => {
          await copyText(document, id)
          announce(document, 'Copied')
        }}
      >
        <CopyIcon />
      </Button>
    </span>
  )
}
