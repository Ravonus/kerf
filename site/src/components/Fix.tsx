import { onMount, state } from 'weft'
import { Button } from '@weft/warp'
import '@weft/ui-core/styles/rich/codeblock.css'
import show from '../generated/showcase.json'

const START = 10
const STEPS = ['Your agent wrote this', 'weft stops the build', 'The fix', 'Now it works']
const SAY = [
  'The component copies its price once, so the number on the page can never change.',
  'The compiler explains what is wrong and refuses to build, so this never reaches a browser.',
  'Read the prop where it is shown, and the copy can go.',
  'The same button now moves the price.',
]
const HINT = ['Press +1. The amount goes up, the price stays stuck.', 'Still stuck: nothing has been built.', 'Still stuck: the fix is not built yet.', 'Press +1. The price follows.']
const PAUSE = 2600

function Live(props: { amount: number }) {
  return <b>{props.amount}</b>
}

/** The compiler's real W001 on real code, as four steps that open broken, with the component it breaks running beside it. */
export function Fix() {
  const step = state(0)
  const amount = state(START)
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
    timers = [1, 2, 3].map(n => setTimeout(() => (step.value = n), n * PAUSE)) as unknown as number[]
  }
  const go = (n: number) => {
    stop()
    step.value = n
  }
  onMount(() => {
    const seen = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { play(); seen.disconnect() }
    }, { threshold: 0.35 })
    seen.observe(box!)
    return () => { seen.disconnect(); stop() }
  })
  return (
    <section data-site="fix" data-step={step.value} ref={(n: any) => (box = n)}>
      <h2>When your agent makes a mistake, weft catches it</h2>
      <p data-part="intro">The compiler stops the mistake before it ships and says how to fix it, in words your agent can act on.</p>
      <ol data-part="steps">
        {STEPS.map((title, n) => (
          <li key={title}>
            <button type="button" aria-current={step.value === n ? 'step' : undefined} onClick={() => go(n)}>
              <span>{n + 1}</span>{title}
            </button>
          </li>
        ))}
      </ol>
      <div data-part="stage">
        <div data-part="code">
          <p data-part="say">{SAY[step.value]}</p>
          <div data-part="panels">
            <div data-show="0" data-scope="codeblock" innerHTML={show.bad}></div>
            <div data-show="1" data-part="diag"><b>{show.code}</b> {show.message}<small>{show.file}. Fix: {show.fix}</small></div>
            <div data-show="2" data-scope="codeblock" innerHTML={show.diff}></div>
            <div data-show="3" data-scope="codeblock" innerHTML={show.good}></div>
          </div>
        </div>
        <div data-part="play">
          <output aria-live="polite">{step.value < 3 ? <b>{START}</b> : <Live amount={amount.value} />}</output>
          <p data-part="amount">Amount {amount.value}</p>
          <Button size="lg" onClick={() => amount.value++}>+1</Button>
          <Button size="lg" emphasis="ghost" tone="neutral" onClick={play}>Replay</Button>
          <p data-part="hint">{HINT[step.value]}</p>
        </div>
      </div>
      <dl>
        <div><dt>Try this</dt><dd>Press +1 on step 1, then again on step 4.</dd></div>
        <div><dt>Why it matters</dt><dd>The error carries the reason and the fix, so an agent can correct its own mistake before you read the code.</dd></div>
      </dl>
    </section>
  )
}
