// What the a11y suite does on ?part=collab. `audit(label)` runs axe on the page as it is.
export default async function (page, audit, url, settle) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${url}?part=collab`)
  await settle(page)
  await audit('collab')
}
