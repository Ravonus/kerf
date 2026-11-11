// What the a11y suite does on ?part=collab. `audit(label)` runs axe on the page as it is.
export default async function (page, audit, url, settle) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${url}?part=collab`)
  await settle(page)
  await audit('collab')

  // a quote draft and the mention list
  await page.locator('[data-mid="m4"]').focus()
  await page.keyboard.press('q')
  await page.locator('[data-scope="composer"] textarea').pressSequentially('@m')
  await settle(page)
  await audit('collab: quote and mention')
  await page.keyboard.press('Escape')

  // the move menu, a resolved thread, a lifted card
  await page.locator('[data-scope="kanban"] [data-part="move"]').first().click()
  await settle(page)
  await audit('collab: move menu')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Preview First draft' }).click()
  await settle(page)
  await audit('collab: version preview')
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click()
  await settle(page)
  await audit('collab: restore confirm')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.goto(`${url}?part=collab&share`)
  await settle(page)
  await audit('collab: share dialog')

  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(`${url}?part=collab`)
  await settle(page)
  await audit('collab: phone')
  await page.locator('[data-scope="comment-anchor"]').click()
  await settle(page)
  await audit('collab: comment sheet')
}
