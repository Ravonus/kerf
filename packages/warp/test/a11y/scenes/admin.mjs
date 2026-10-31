// What the a11y suite does on ?part=admin. `audit(label)` runs axe on the page as it is.
const TABS = ['settings', 'members', 'keys', 'billing', 'audit', 'integrations', 'import', 'shop']

export default async function (page, audit, url, settle) {
  const open = async (query, width = 1280) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`${url}?part=admin&${query}`)
    await settle(page)
  }
  for (const width of [1280, 390]) for (const tab of TABS) {
    await open(`tab=${tab}`, width)
    await audit(`admin ${tab} ${width}`)
  }
  await open('tab=settings&delete')
  await audit('admin type to confirm')
  await open('tab=settings&archive', 390)
  await audit('admin confirm, phone')
  await open('tab=members&invite')
  await audit('admin invite')
  await open('tab=shop&cart')
  await audit('admin cart drawer')
  await open('tab=keys')
  await page.getByRole('button', { name: 'Create test key' }).click()
  await settle(page)
  await audit('admin create key')
  await page.keyboard.press('Escape')
  await open('tab=settings')
  await page.getByLabel('Display name').fill('Ada')
  await settle(page)
  await audit('admin save bar')
  await open('tab=import')
  await page.getByRole('button', { name: 'Use the sample' }).click()
  await settle(page)
  await audit('admin import map')
  await page.getByRole('button', { name: 'Preview' }).click()
  await settle(page)
  await audit('admin import review')
  await open('tab=shop')
  await page.getByRole('button', { name: 'Continue to address' }).click()
  await page.getByRole('button', { name: 'Continue to shipping' }).click()
  await settle(page)
  await audit('admin checkout address errors')
}
