// What the a11y suite does on ?part=live. `audit(label)` runs axe on the page as it is.
export default async function (page, audit, url, settle) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${url}?part=live`)
  await settle(page)
  await audit('live')
  await page.getByRole('button', { name: /^Notifications,/ }).click()
  await audit('live: inbox popover')
  await page.keyboard.press('Escape')
  await page.locator('[data-go-offline]').click()
  await audit('live: offline banner')
  await page.locator('[data-go-offline]').click()
  await page.locator('label:has(input[value="memory"])').click()
  await page.getByLabel('Deploy preset').selectOption('multi')
  await audit('live: transport build error')
  for (const layout of ['speaker', 'presentation', 'board']) {
    await page.goto(`${url}?part=live&layout=${layout}&side`)
    await settle(page)
    await audit(`live: room ${layout}`)
  }
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(`${url}?part=live`)
  await settle(page)
  await audit('live: phone')
}
