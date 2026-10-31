// What the a11y suite does on ?part=flow. `audit(label)` runs axe on the page as it is.
export default async function (page, audit, url, settle) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${url}?part=flow`)
  await settle(page)
  await audit('flow')
  // the failure surfaces and the 403's note, driven as a user
  const signin = page.locator('[data-scope="auth"] form').first()
  await signin.locator('button[type="submit"]').click()
  await settle(page)
  await audit('flow: invalid fields')
  await page.getByRole('button', { name: 'Request access' }).click()
  await settle(page)
  await audit('flow: 403 note')
  await page.getByRole('button', { name: 'Review and sign' }).click()
  await settle(page)
  await audit('flow: inline signer')
  for (const open of ['mfa', 'reauth', 'shortcuts', 'tour']) {
    await page.goto(`${url}?part=flow&flow=${open}`)
    await settle(page)
    await audit(`flow: ${open}`)
  }
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(`${url}?part=flow`)
  await settle(page)
  await audit('flow: phone')
  for (const open of ['shortcuts', 'tour']) {
    await page.goto(`${url}?part=flow&flow=${open}`)
    await settle(page)
    await audit(`flow: ${open}, phone`)
  }
  await page.setViewportSize({ width: 1280, height: 800 })
}
