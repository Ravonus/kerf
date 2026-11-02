import { fireEvent } from '@testing-library/dom'
import { flush, render } from '@weft-js/core/test'
import { Sparkline } from '../src/Charts'

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms))
const settle = async () => { await tick(); await flush(); await tick(); await flush() }

describe('Sparkline hover', () => {
  const mount = async () => {
    const { container: c } = render(() => <div aria-label="Rising"><Sparkline values={[10, 30, 20, 40]} /></div>)
    await settle()
    const svg = c.querySelector('svg')!
    svg.getBoundingClientRect = () => ({ left: 100, width: 208, top: 0, height: 36, right: 308, bottom: 36, x: 100, y: 0 }) as DOMRect
    return svg
  }
  test('the dot follows the pointer to the nearest point and says its value, and goes back after', async () => {
    const svg = await mount()
    const dot = svg.querySelector('.dot')!
    const home = [dot.getAttribute('cx'), dot.getAttribute('cy')]
    fireEvent.pointerMove(svg, { clientX: 100 + 70 })
    expect(svg.querySelector('text')!.textContent).toBe('30')
    expect(dot.getAttribute('cx')).not.toBe(home[0])
    fireEvent.pointerMove(svg, { clientX: 100 + 140 })
    expect(svg.querySelector('text')!.textContent).toBe('20')
    fireEvent.pointerMove(svg, { clientX: 9999 })
    expect(svg.querySelector('text')!.textContent).toBe('40')
    fireEvent.pointerLeave(svg)
    expect(svg.querySelector('text')).toBeNull()
    expect([dot.getAttribute('cx'), dot.getAttribute('cy')]).toEqual(home)
  })
  test('format says the hovered value the way the headline does', async () => {
    const { container: c } = render(() => <div aria-label="Errors"><Sparkline values={[0.22, 0.44, 0.3]} format={v => `${v}%`} /></div>)
    await settle()
    const svg = c.querySelector('svg')!
    svg.getBoundingClientRect = () => ({ left: 0, width: 208, top: 0, height: 36, right: 208, bottom: 36, x: 0, y: 0 }) as DOMRect
    fireEvent.pointerMove(svg, { clientX: 104 })
    expect(svg.querySelector('text')!.textContent).toBe('0.44%')
  })
  test('the site\'s error-rate sparkline carries its headline\'s unit', async () => {
    const { SparklineColors } = await import('../../../site/src/toolkit/examples/charts')
    const { container: c } = render(() => <SparklineColors />)
    await settle()
    const svg = c.querySelector('svg[data-part="spark"]')! as SVGSVGElement
    svg.getBoundingClientRect = () => ({ left: 0, width: 208, top: 0, height: 36, right: 208, bottom: 36, x: 0, y: 0 }) as DOMRect
    fireEvent.pointerMove(svg, { clientX: 0 })
    expect(svg.querySelector('text')!.textContent).toMatch(/^\d+(\.\d+)?%$/)
  })
})
