import { onMount, state, untrack } from 'weft'
import { Button } from '@weft/warp'
import '@weft/ui-core/styles/rich/codeblock.css'
import show from '../generated/showcase.json'

function Frozen(props: { amount: number }) {
  const amount = untrack(() => props.amount)
  return <b>{amount}</b>
}
function Live(props: { amount: number }) {
  return <b>{props.amount}</b>
}

/** The compiler's real W001 on real code, played out, with the component it breaks running beside it. */
export function Fix() {
  const step = state(0)
  const amount = state(10)
  let box: HTMLElement | undefined
  let timers: number[] = []
  const play = () => {
    timers.forEach(clearTimeout)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return void (step.value = 2)
    step.value = 0
    timers = [setTimeout(() => (step.value = 1), 900), setTimeout(() => (step.value = 2), 2800)] as unknown as number[]
  }
  onMount(() => {
    const seen = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { play(); seen.disconnect() }
    }, { threshold: 0.35 })
    seen.observe(box!)
    return () => { seen.disconnect(); timers.forEach(clearTimeout) }
  })
  return (
    <section data-site="fix" data-step={step.value} ref={(n: any) => (box = n)}>
      <h2>Your coding agent can build with it</h2>
      <p data-part="intro">weft's compiler doesn't only say a line is wrong. It says why, in words, with a code and a fix an agent can apply. Here a component copies a prop once, so the price on screen would never change. The compiler stops the build, explains, and the fix is one line.</p>
      <div data-part="stage">
        <div data-part="code">
          <div data-part="bad" data-scope="codeblock" innerHTML={show.bad}></div>
          <div data-part="good" data-scope="codeblock" innerHTML={show.good}></div>
          <p data-part="diag"><b>{show.code}</b> {show.message}</p>
          <p data-part="done">0 diagnostics</p>
        </div>
        <div data-part="play">
          <output aria-live="polite">{step.value < 2 ? <Frozen amount={amount.value} /> : <Live amount={amount.value} />}</output>
          <Button size="lg" onClick={() => amount.value++}>+1</Button>
          <Button size="lg" emphasis="ghost" tone="neutral" onClick={play}>Replay the fix</Button>
          <p data-part="hint">{step.value < 2 ? 'Broken: +1 changes the amount, but the number stays put.' : 'Fixed: the number follows the amount.'}</p>
        </div>
      </div>
      <dl>
        <div><dt>Try this</dt><dd>Press +1 before and after the fix, or replay it.</dd></div>
        <div><dt>Why it matters</dt><dd>An agent gets the rule and the fix in the error itself, so it corrects its own mistakes without you reading the code first. `weft docs` serves it the same text as this site.</dd></div>
      </dl>
    </section>
  )
}
