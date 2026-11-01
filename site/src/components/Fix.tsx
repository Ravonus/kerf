import { onMount, state, untrack } from 'weft'
import { Button } from '@weft/warp'
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
    }, { threshold: 0.5 })
    seen.observe(box!)
    return () => { seen.disconnect(); timers.forEach(clearTimeout) }
  })
  return (
    <section data-site="fix" data-step={step.value} ref={(n: any) => (box = n)}>
      <h2>Broken. Told why. Fixed.</h2>
      <div data-part="stage">
        <div data-part="code">
          <div data-part="bad" data-scope="codeblock" innerHTML={show.bad}></div>
          <div data-part="good" data-scope="codeblock" innerHTML={show.good}></div>
          <p data-part="diag"><b>{show.code}</b> {show.message}</p>
          <p data-part="done">0 diagnostics</p>
        </div>
        <div data-part="live">
          <output aria-live="polite">{step.value < 2 ? <Frozen amount={amount.value} /> : <Live amount={amount.value} />}</output>
          <Button size="lg" onClick={() => amount.value++}>+1</Button>
          <Button size="lg" emphasis="ghost" tone="neutral" onClick={play}>Again</Button>
        </div>
      </div>
    </section>
  )
}
