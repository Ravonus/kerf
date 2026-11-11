import { Button } from '../../Button'

export function FeedbackReasonPanel({
  reasons,
  because,
  setPanel,
}: {
  reasons: string[]
  because: (e: Event, reason: string) => void
  setPanel: (n: HTMLDivElement) => void
}) {
  return (
    <div
      ref={setPanel}
      data-scope="popover"
      data-part="content"
      role="dialog"
      popover="manual"
      aria-label="What went wrong?"
    >
      <p data-part="title">What went wrong?</p>
      <div>
        {reasons.map((r) => (
          <Button
            key={r}
            emphasis="ghost"
            tone="neutral"
            size="sm"
            data-close-popover=""
            onClick={(e: Event) => because(e, r)}
          >
            {r}
          </Button>
        ))}
      </div>
    </div>
  )
}
