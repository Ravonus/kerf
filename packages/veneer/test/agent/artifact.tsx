import { flush, render } from '@kerf/core/test'
import { Toaster } from '../../src/Toast'
import { ArtifactPanel } from '../../src/agent/ArtifactPanel'
import { wait } from '../timers.mjs'
import { button, key, said } from './support'

const VERSIONS = [
  { id: 'v2', label: 'v2 · new', code: 'two' },
  { id: 'v1', label: 'v1 · old', code: 'one' },
]

export function registerArtifactPanelAPGTabsAVersions() {
  test('ArtifactPanel: APG tabs, a versions listbox, Code follows the version', async () => {
    const seen: string[] = []
    const { container: c } = render(() => (
      <>
        <Toaster />
        <ArtifactPanel title="T" versions={VERSIONS} onVersion={(v) => seen.push(v)}>
          hello
        </ArtifactPanel>
      </>
    ))
    await flush()
    const tabs = [...c.querySelectorAll<HTMLElement>('[role="tab"]')]
    const panels = () =>
      [...c.querySelectorAll<HTMLElement>('[role="tabpanel"]')].map((p) => p.hidden)
    expect(panels()).toEqual([false, true, true])
    tabs[0]!.focus()
    key(tabs[0]!, 'ArrowRight')
    await flush()
    expect(document.activeElement).toBe(tabs[1])
    expect(panels()).toEqual([true, false, true])
    expect(c.querySelector('pre')!.textContent).toBe('two')
    key(tabs[1]!, 'End')
    await flush()
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true')
    const opts = [...c.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(opts[0]!.getAttribute('aria-current')).toBe('true')
    opts[0]!.focus()
    key(opts[0]!, 'ArrowDown')
    await flush()
    await wait()
    expect(seen).toEqual(['v1'])
    expect(opts[1]!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(opts[1])
    expect(c.querySelector('pre')!.textContent).toBe('one')
    expect(said(c)).toContain('v1 · old')
  })
  test('ArtifactPanel Copy writes the code and says so', async () => {
    const write = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: write },
      configurable: true,
    })
    const { container: c } = render(() => (
      <>
        <Toaster />
        <ArtifactPanel title="T" versions={VERSIONS}>
          x
        </ArtifactPanel>
      </>
    ))
    await flush()
    button(c, 'Copy').click()
    await wait()
    expect(write).toHaveBeenCalledWith('two')
    expect(said(c)).toBe('Copied to clipboard')
  })
}
