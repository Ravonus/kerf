import { fireEvent } from '@testing-library/dom'
import { flush, render } from 'weft/test'
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
})
