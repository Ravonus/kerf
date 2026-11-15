import { createRequire } from 'node:module'
import { inject, beforeAll, afterAll, expect, test } from 'vitest'
import type * as Playwright from 'playwright-core'
const url = inject('url')
const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})
async function open(reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  const context = await browser.newContext({ reducedMotion }),
    page = await context.newPage()
  await page.goto(url + '/shared/large')
  await page.waitForFunction(() => window.__kerf?.hydrated)
  return { page, context }
}
test('captures before optimistic layout changes and moves the incoming mark before data arrives', async () => {
  const { page, context } = await open()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_kerf/data/shared/small*', async (route) => {
    await gate
    await route.continue()
  })
  const before = await page.locator('[data-kerf-shared]').evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return range.getBoundingClientRect().toJSON()
  })
  await page.getByRole('link', { name: 'Small mark', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('[data-kerf-shared]')?.getAnimations().length,
  )
  const result = await page.locator('[data-kerf-shared]').evaluate((element) => {
    const animation = element.getAnimations()[0]!
    animation.pause()
    animation.currentTime = 0
    const range = document.createRange()
    range.selectNodeContents(element)
    return {
      box: range.getBoundingClientRect().toJSON(),
      duration: animation.effect!.getTiming().duration,
      frames: (animation.effect as KeyframeEffect).getKeyframes(),
      current: location.pathname,
    }
  })
  expect(result.current).toBe('/shared/small')
  expect(result.duration).toBe(480)
  expect(result.box.left).toBeCloseTo(before.left, 0)
  expect(result.box.top).toBeCloseTo(before.top, 0)
  expect(result.box.width).toBeCloseTo(before.width, 0)
  expect(result.frames[0]!.transform).not.toBe(result.frames.at(-1)!.transform)
  release()
  await page.locator('[data-kerf-shared]').evaluate(async (element) => {
    const animations = element.getAnimations()
    animations.forEach((animation) => animation.play())
    await Promise.all(animations.map((animation) => animation.finished))
  })
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute('data-kerf-shared-active'),
  )
  expect(await page.getByRole('heading', { name: 'Small gallery', exact: true }).count()).toBe(1)
  await context.close()
})
test('Back and rapid reversal cancel old motion without leaving a hidden or transformed mark', async () => {
  const { page, context } = await open()
  await page.getByRole('link', { name: 'Small mark', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('[data-kerf-shared]')?.getAnimations().length,
  )
  await page.locator('[data-kerf-shared]').evaluate((element) => {
    const animation = element.getAnimations()[0]!
    animation.pause()
    animation.currentTime = 240
  })
  await page.goBack()
  await page.waitForFunction(
    () =>
      location.pathname === '/shared/large' &&
      document.querySelector('[data-kerf-shared]')?.getAnimations().length,
  )
  await page.locator('[data-kerf-shared]').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  expect(
    await page
      .locator('[data-kerf-shared]')
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe('none')
  expect(await page.locator('[data-kerf-shared]').count()).toBe(1)
  await context.close()
})
test('reduced motion preserves the immediate URL without animation', async () => {
  const { page, context } = await open('reduce')
  await page.getByRole('link', { name: 'Small mark', exact: true }).click()
  expect(new URL(page.url()).pathname).toBe('/shared/small')
  expect(
    await page.locator('[data-kerf-shared]').evaluate((element) => element.getAnimations().length),
  ).toBe(0)
  await context.close()
})
test('navigation opt-out keeps the immediate URL without a shared animation', async () => {
  const { page, context } = await open()
  await page.getByRole('button', { name: 'Without motion', exact: true }).click()
  expect(new URL(page.url()).pathname).toBe('/shared/small')
  expect(
    await page.locator('[data-kerf-shared]').evaluate((element) => element.getAnimations().length),
  ).toBe(0)
  await context.close()
})
