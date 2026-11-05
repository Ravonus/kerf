import type { Page } from 'playwright-core'

export function registerSmallButtonOffset(getPage: () => Page) {
  test('vivid: a small button lifts on a small offset, not the full bar under a 24px copy icon', async () => {
    const page = getPage()
    const off = await page.evaluate(() => {
      const read = (el: HTMLElement) => {
        const i = document.createElement('i')
        i.style.cssText = 'position:absolute;inline-size:var(--warp-offset)'
        el.append(i)
        const w = i.getBoundingClientRect().width
        i.remove()
        return w
      }
      return {
        copy: read(document.querySelector<HTMLElement>('#code-vivid [data-act="copy"]')!),
        solid: read(document.querySelector<HTMLElement>('#solid button')!),
      }
    })
    expect(off.solid).toBeGreaterThan(0)
    expect(off.copy).toBeLessThanOrEqual(off.solid / 2)
  })
}
