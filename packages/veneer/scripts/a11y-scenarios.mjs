import { scenes } from '../test/a11y/scenes/index.mjs'

// Let entry motion and sweeps finish.
const settle = (page) => page.waitForTimeout(700)

// What each site does between audits. `audit(label)` runs axe on the page as it is.
export const SCENARIOS = {
  async gallery(page, audit, url) {
    await page.goto(`${url}?part=static`)
    await settle(page)
    await audit('static')
    await page.getByRole('button', { name: 'Copy' }).focus()
    await audit('tooltip')
    await page.getByLabel('Name', { exact: true }).focus()
    await audit('focused field')
    await page.goto(`${url}?part=added`)
    await settle(page)
    await audit('added')
    await page.getByRole('button', { name: 'Actions' }).click()
    await audit('menu open')
    await page.keyboard.press('Escape')
    await page.getByLabel('Sort by').click()
    await audit('select open')
    await page.keyboard.press('Escape')
    await page.goto(`${url}?part=overlays`)
    await settle(page)
    await audit('modal + drawer open')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Plain' }).click()
    await audit('popover open')
    await page.goto(`${url}?part=toasts`)
    await settle(page)
    await audit('toasts')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=table`)
    await settle(page)
    await audit('tables')
    await page.getByRole('checkbox', { name: 'Select Apollo' }).check({ force: true })
    await page.getByRole('button', { name: 'Details for Apollo' }).click()
    await audit('row selected and open')
    await page.getByRole('button', { name: 'Columns' }).first().click()
    await audit('columns open')
    await page.keyboard.press('Escape')
    await page.getByRole('searchbox', { name: 'Filter projects' }).fill('zzz')
    await audit('filter, no match')
    await page.setViewportSize({ width: 800, height: 800 })
    await page.goto(`${url}?part=table`)
    await page.getByRole('button', { name: 'Details for Apollo' }).click()
    await audit('tablet, details open')
    await page.goto(`${url}?part=table&sheet`)
    await page.getByRole('button', { name: 'Details for Apollo' }).click()
    await audit('tablet, detail sheet')
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto(`${url}?part=table`)
    await settle(page)
    await audit('phone cards')
    await page.getByRole('button', { name: 'Details for Apollo' }).click()
    await audit('phone card, details open')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=shell`)
    await settle(page)
    await audit('desktop shell')
    await page.getByRole('button', { name: 'Account: Ana Ruiz' }).click()
    await audit('account menu')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await audit('collapsed sidebar')
    await page.setViewportSize({ width: 800, height: 800 })
    await page.reload()
    await settle(page)
    await audit('tablet rail')
    await page.getByRole('button', { name: 'Expand navigation' }).click()
    await audit('rail overlay')
    await page.setViewportSize({ width: 390, height: 800 })
    await page.reload()
    await settle(page)
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight)) // nothing left under the sticky bottom bar
    await audit('phone bars')
    await page.getByRole('button', { name: 'More' }).click()
    await audit('more sheet')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=shell&focus`)
    await settle(page)
    await audit('focus shell')
  },
  async virtual(page, audit, url) {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=virtual`)
    await settle(page)
    await audit('virtual collections')
    await page
      .getByRole('button', { name: /^Move /, exact: false })
      .first()
      .click()
    await audit('kanban move menu')
    await page.keyboard.press('Escape')
    await page.getByRole('grid').focus()
    await page.keyboard.press('ArrowDown')
    await audit('grid active cell')
    await page.getByRole('log').getByRole('article').first().focus()
    await page.keyboard.press('End')
    await audit('thread at the end')
  },
  async charts(page, audit, url) {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${url}?part=charts`)
    await settle(page)
    await audit('every form')
    await page.locator('[data-mark]').first().focus()
    await page.keyboard.press('ArrowRight')
    await audit('tooltip on a focused mark')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Table view' }).first().click()
    await audit('table view')
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto(`${url}?part=charts`)
    await settle(page)
    await audit('every form on a phone')
    await page.goto(`${url}?part=rich`)
    await settle(page)
    await audit('rich inputs')
    // each panel in turn: the date calendar, the range presets, a month grid, a search list
    for (const name of [
      /^Open calendar|^Choose date|calendar/i,
      /^Billing month/,
      /^Time zone/,
      /^Fiscal period/,
      /^Sprint/,
    ]) {
      const trigger = page.getByRole('button', { name }).first()
      await trigger.click()
      await settle(page)
      await audit(`panel ${name}`)
      await page.keyboard.press('Escape')
    }
    await page.getByRole('combobox', { name: 'Place of birth' }).fill('li')
    await page.getByRole('option').first().waitFor()
    await audit('combobox open')
    await page.goto(`${url}?part=surfaces`)
    await settle(page)
    await audit('grids and editors on a phone')
    await page.setViewportSize({ width: 1280, height: 800 })
    await settle(page)
    await audit('grids and editors')
    await page.getByRole('grid').first().locator('tbody [tabindex="0"]').first().focus()
    await page.keyboard.press('ArrowRight')
    await audit('grid cell focused')
    await page.getByRole('button', { name: 'Page 4' }).focus()
    await audit('page button focused')
    await page
      .getByRole('combobox', { name: 'Comment' })
      .or(page.getByRole('textbox', { name: 'Comment' }))
      .first()
      .fill('Hi @a')
    await page.locator(':popover-open [role="option"]').first().waitFor()
    await audit('mention list open')
    await page.keyboard.press('Escape')
    await page.getByRole('textbox', { name: 'Notes' }).focus()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('/')
    await page.locator(':popover-open [role="option"]').first().waitFor()
    await audit('slash menu open')
    await page.keyboard.press('Escape')
    // the highlight is only worth its write if it lands on the row: the audit can't see this, and jsdom has no layout
    const onRow = async () => {
      await page.waitForTimeout(500)
      const off = await page.evaluate(() => {
        const row = document.querySelector('dialog[open] [aria-selected="true"]'),
          face = document.querySelector('dialog[open] [data-part="shuttle"]')
        return row && face
          ? Math.abs(row.getBoundingClientRect().top - face.getBoundingClientRect().top)
          : null
      })
      if (off === null || off > 1) throw new Error(`palette shuttle is ${off}px off its row`)
    }
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await onRow()
    await page.locator('input[role="combobox"]:visible').first().fill('e')
    await audit('palette open')
    await onRow()
  },
  ...Object.fromEntries(
    Object.entries(scenes).map(([name, run]) => [
      name,
      (page, audit, url) => run(page, audit, url, settle),
    ]),
  ),
  async shop(page, audit, url) {
    await page.goto(url)
    await page.getByRole('button', { name: /^Add/ }).first().waitFor()
    await audit('products')
    await page.getByRole('button', { name: /^Add/ }).first().click()
    await page.getByRole('button', { name: /^Cart/ }).click()
    await audit('cart')
  },
}
