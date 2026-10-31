// What the a11y suite does on ?part=agent. `audit(label)` runs axe on the page as it is.
export default async function (page, audit, url, settle) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${url}?part=agent`)
  await settle(page)
  await audit('agent')
}
