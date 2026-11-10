import { derived, onMount, state } from '@weft-js/core'
import { Button } from '@weft-js/warp'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import show from '../generated/showcase.json'

const START = 2
const EACH = 5
const STEPS = ['Your agent wrote this', 'Weft stops the build', 'The fix', 'Now it works']
const SAY = [
  'The component works out its total once, so the number on the page can never change.',
  'The compiler explains what is wrong and refuses to build, so this never reaches a browser.',
  'Put the sum in derived, and it follows the count.',
  'The same button now moves the total.',
]
const HINT = [
  'Press +1. The count goes up, the total stays stuck.',
  'Still stuck: nothing has been built.',
  'Still stuck: the fix is not built yet.',
  'Press +1. The price follows.',
]
const PAUSE = 2600

function Live(props: { count: number }) {
  const total = derived(() => props.count * EACH)
  return <b>{total.value}</b>
}

/* @weft visible */
/** The compiler's real W001 on real code, as four steps that open broken, with the component it breaks running beside it. */
export function Fix() {
  const step = state(0)
  const count = state(START)
  let box: HTMLElement | undefined
  let timers: number[] = []
  const stop = () => {
    timers.forEach(clearTimeout)
    timers = []
  }
  const play = () => {
    stop()
    step.value = 0
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    timers = [1, 2, 3].map((n) =>
      setTimeout(() => (step.value = n), n * PAUSE),
    ) as unknown as number[]
  }
  const go = (n: number) => {
    stop()
    step.value = n
  }
  onMount(() => {
    const seen = new IntersectionObserver(
      ([e]) => {
        if (e!.isIntersecting) {
          play()
          seen.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    seen.observe(box!)
    return () => {
      seen.disconnect()
      stop()
    }
  })
  return renderFix({ step, count, go, play, setBox: (el) => (box = el) })
}

type FixView = {
  step: ReturnType<typeof state<number>>
  count: ReturnType<typeof state<number>>
  go: (n: number) => void
  play: () => void
  setBox: (el: HTMLElement) => void
}

const renderFix = (o: FixView) => (
  <section data-site="fix" data-step={o.step.value} ref={o.setBox}>
    <h2>When your agent makes a mistake, Weft catches it</h2>
    <p data-part="intro">
      The compiler stops the mistake before it ships and says how to fix it, in words your agent can
      act on.
    </p>
    <ol data-part="steps">
      {STEPS.map((title, n) => (
        <li key={title}>
          <Button
            emphasis="ghost"
            tone="neutral"
            aria-current={o.step.value === n ? 'step' : undefined}
            onClick={() => o.go(n)}
          >
            <span>{n + 1}</span>
            {title}
          </Button>
        </li>
      ))}
    </ol>
    <div data-part="stage">
      <div data-part="code">
        <p data-part="say">{SAY[o.step.value]}</p>
        <div data-part="panels">
          <div
            data-show="0"
            data-scope="codeblock"
            // oxlint-disable-next-line weft/no-html-sink -- highlighted at build time from a fixed sample
            innerHTML={show.bad}
          ></div>
          <div data-show="1" data-part="diag">
            <b>{show.code}</b> {show.message}
            <small>
              {show.file}. Fix: {show.fix}
            </small>
          </div>
          <div
            data-show="2"
            data-scope="codeblock"
            // oxlint-disable-next-line weft/no-html-sink -- highlighted at build time from a fixed sample
            innerHTML={show.diff}
          ></div>
          <div
            data-show="3"
            data-scope="codeblock"
            // oxlint-disable-next-line weft/no-html-sink -- highlighted at build time from a fixed sample
            innerHTML={show.good}
          ></div>
        </div>
      </div>
      <div data-part="play">
        <output aria-live="polite">{fixTotal(o.step, o.count)}</output>
        <p data-part="amount">Count {o.count.value}</p>
        <Button size="lg" onClick={() => o.count.value++}>
          +1
        </Button>
        <Button size="lg" emphasis="ghost" tone="neutral" onClick={o.play}>
          Replay
        </Button>
        <p data-part="hint">{HINT[o.step.value]}</p>
      </div>
    </div>
    <dl>
      <div>
        <dt>Try this</dt>
        <dd>Press +1 on step 1, then again on step 4.</dd>
      </div>
      <div>
        <dt>Why it matters</dt>
        <dd>
          The error carries the reason and the fix, so an agent can correct its own mistake before
          you read the code.
        </dd>
      </div>
    </dl>
  </section>
)

function fixTotal(step: ReturnType<typeof state<number>>, count: ReturnType<typeof state<number>>) {
  return step.value < 3 ? <b>{START * EACH}</b> : <Live count={count.value} />
}
