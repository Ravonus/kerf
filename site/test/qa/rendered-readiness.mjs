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
  await page.evaluate(async () => {
    const pending = document.getAnimations().filter((animation) => {
      const end = animation.effect?.getComputedTiming().endTime
      return (
        animation.timeline === document.timeline &&
        animation.playState === 'running' &&
        Number.isFinite(end)
      )
    })
    await Promise.allSettled(pending.map((animation) => animation.finished))
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
  await block.evaluate(async (el) => {
    const pending = []
    for (let parent = el; parent; parent = parent.parentElement) {
      for (const animation of parent.getAnimations()) {
        const end = animation.effect?.getComputedTiming().endTime
        if (
          animation.timeline === document.timeline &&
          animation.playState === 'running' &&
          Number.isFinite(end)
        )
          pending.push(animation.finished)
      }
    }
    await Promise.allSettled(pending)
  })
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
