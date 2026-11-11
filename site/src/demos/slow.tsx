import { state } from '@kerf/core'
import { Button } from '@kerf/veneer'

const times = [500, 1500, 3000]

export default function SlowPage() {
  const ms = state(1500)
  const run = state(0)
  const go = (t: number) => {
    ms.value = t
    run.value++
  }
  return (
    <div data-part="slow">
      <p>
        {times.map((t) => (
          <Button
            key={t}
            size="sm"
            tone="neutral"
            onClick={() => go(t)}
          >
            {t / 1000} s
          </Button>
        ))}
      </p>
      <iframe
        title="A slow page"
        loading="lazy"
        src={
          `/examples/slow?ms=${ms.value}` +
          `&run=${run.value}`
        }
      ></iframe>
    </div>
  )
}
