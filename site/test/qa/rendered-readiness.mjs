import { measureBlock, checkBlock } from './rendered-rows.mjs'

// Open intentional solutions and wait for fonts, visible previews and finite animations.
export async function prepareCode(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    for (const details of document.querySelectorAll('[data-site="challenge"] details'))
      details.open = true
  })
  await page.waitForFunction(() => {
    if (document.documentElement.hasAttribute('data-flow-armed')) return true
    window.scrollTo({ top: window.scrollY ? 0 : 1, behavior: 'instant' })
    return false
  })
  const mounts = page.locator('[data-part="mount"]')
  for (let i = 0; i < (await mounts.count()); i++) {
    const mount = mounts.nth(i)
    if (!(await mount.isVisible())) continue
    await mount.scrollIntoViewIfNeeded()
    const element = await mount.elementHandle()
    await page.waitForFunction((el) => el.hasAttribute('data-ready'), element, { timeout: 10000 })
  }
  const views = page.locator('[data-site="frame"] [data-act="stage-view"][data-view="code"]')
  for (let i = 0; i < (await views.count()); i++) {
    const view = views.nth(i)
    if (await view.isVisible()) await view.click()
  }
  await page.waitForFunction(() => {
    return !document.getAnimations().some((animation) => {
      const end = animation.effect?.getComputedTiming().endTime
      return (
        animation.timeline === document.timeline &&
        animation.playState === 'running' &&
        Number.isFinite(end)
      )
    })
  })
}

// A phone page must not require sideways page scrolling.
export async function checkPageOverflow(page) {
  const over = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  )
  if (over) throw new Error(`page overflows by ${over}px`)
}

// Scrolling can start a new finite entrance animation after the initial page wait.
export async function settleBlock(block) {
  const element = await block.elementHandle()
  await block.page().waitForFunction((el) => {
    for (let parent = el; parent; parent = parent.parentElement) {
      for (const animation of parent.getAnimations()) {
        const end = animation.effect?.getComputedTiming().endTime
        if (
          animation.timeline === document.timeline &&
          animation.playState === 'running' &&
          Number.isFinite(end)
        )
          return false
      }
    }
    return true
  }, element)
  const state = await block.page().waitForFunction((el) => {
    if (!el.checkVisibility({ visibilityProperty: true })) return 'hidden'
    let pending = false
    for (let parent = el; parent; parent = parent.parentElement) {
      if (Number(getComputedStyle(parent).opacity) !== 0) continue
      const moving = parent
        .getAnimations()
        .some(
          (animation) =>
            animation.timeline !== document.timeline && animation.playState === 'running',
        )
      if (!moving) return 'hidden'
      pending = true
    }
    return pending ? false : 'visible'
  }, element)
  return (await state.jsonValue()) === 'visible'
}

// A focusable code scroller must respond to the keyboard before overflow is accepted.
export async function checkCodeScroll(page, block) {
  await block.focus()
  await block.evaluate((el) => {
    el.scrollLeft = 0
  })
  await page.keyboard.press('ArrowRight')
  const element = await block.elementHandle()
  await page.waitForFunction((el) => el.scrollLeft > 0, element)
  await block.evaluate((el) => {
    el.scrollLeft = 0
  })
}

// Measure only visible source lines, and require coverage on every page.
export async function checkRenderedBlocks(page, phone) {
  const blocks = page.locator('main pre')
  let measured = 0
  for (let i = 0; i < (await blocks.count()); i++) {
    const block = blocks.nth(i)
    if (!(await block.isVisible())) continue
    await block.scrollIntoViewIfNeeded()
    if (!(await settleBlock(block))) continue
    const visible = await block.evaluate((el) =>
      el.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
    )
    if (!visible) continue
    await block.evaluate((el) => {
      el.scrollLeft = 0
    })
    const result = await block.evaluate(measureBlock)
    checkBlock(result, phone, `block ${i + 1}`)
    if (phone && result.scrollable && result.lines.some((line) => line.clippedRight))
      await checkCodeScroll(page, block)
    measured += result.lines.filter((line) => line.rows.length).length
  }
  if (!measured) throw new Error('no visible highlighted source lines')
}
