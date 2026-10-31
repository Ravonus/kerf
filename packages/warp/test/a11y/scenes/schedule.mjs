// What the a11y suite does on ?part=schedule. `audit(label)` runs axe on the page as it is.
const VIEWS = ['week', 'day', 'month', 'agenda', 'timeline', 'year']

export default async function (page, audit, url, settle) {
  const load = async (view, width = 1280) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`${url}?part=schedule&view=${view}`)
    await settle(page)
  }
  for (const view of VIEWS) {
    await load(view)
    await audit(`schedule ${view}`)
  }

  // the event card, the editor and the delete dialog, opened as a person would
  await load('week')
  await page.getByRole('button', { name: /^Design crit, Monday/ }).click()
  await settle(page)
  await audit('schedule event card')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await settle(page)
  await audit('schedule event editor')
  await page.keyboard.press('Escape')
  await settle(page)

  // a repeating event's scope dialog
  await page.getByRole('button', { name: /^Standup/ }).first().click()
  await settle(page)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await settle(page)
  await audit('schedule recurrence scope')

  // keyboard move mode
  await load('week')
  await page.getByRole('button', { name: /^Lunch,/ }).first().focus()
  await page.keyboard.press('m')
  await page.keyboard.press('ArrowDown')
  await settle(page)
  await audit('schedule moving')

  // the phone: the week, and the agenda's long-press path by keyboard
  await load('week', 390)
  await audit('schedule phone')
  await page.locator('[data-frame=phone] [data-part=row][data-id]').nth(2).focus()
  await page.keyboard.press('Enter')
  await settle(page)
  await audit('schedule move sheet')
  await page.setViewportSize({ width: 1280, height: 800 })
}
