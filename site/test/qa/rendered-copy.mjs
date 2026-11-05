// Observe the real copy action and compare it to the unchanged source-line text.
export async function checkCopies(page) {
  await page.evaluate(() => {
    window.__qaCopies = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => window.__qaCopies.push(text) },
    })
  })
  const buttons = page.locator('main [data-scope="codeblock"] [data-act="copy"]')
  let checked = 0
  for (let i = 0; i < (await buttons.count()); i++) {
    const button = buttons.nth(i)
    if (!(await button.isVisible())) continue
    const source = await button.evaluate((b) => {
      const code = b.closest('[data-scope="codeblock"]').querySelector('code')
      const lines = code?.querySelectorAll('[data-part="line"]')
      return lines?.length
        ? Array.from(lines, (line) => line.textContent).join('\n')
        : code?.textContent
    })
    if (source === undefined) throw new Error(`copy button ${i + 1} has no code`)
    await button.scrollIntoViewIfNeeded()
    await button.click()
    checked++
    await page.waitForFunction((n) => window.__qaCopies.length >= n, checked)
    const copied = await page.evaluate((n) => window.__qaCopies[n - 1], checked)
    if (copied !== source) throw new Error(`copy button ${i + 1} changes source text`)
  }
  if (!checked) throw new Error('no visible copy action')
  return checked
}
