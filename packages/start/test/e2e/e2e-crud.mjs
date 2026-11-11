// The todo app with no sign-in (research 34 §9): what every data layer has to do, for layers without auth. Roles and
// labels, so it holds for every `--ui`.
import { createRequire } from 'node:module'
import { suite } from './e2e-todo.mjs'

const { chromium } = createRequire(new URL('../../scripts/e2e-crud.mjs', import.meta.url))(
  'playwright-core',
)

export default async function run({ url, log }) {
  const t = suite({ url, log })
  const { check, eq, open, hydrated, titles } = t
  // Rows show optimistically, so wait for the write itself before a reload.
  const add = async (page, title) => {
    const written = page.waitForResponse(
      (r) => r.url().includes('/_kerf/fn/') && r.request().method() === 'POST',
    )
    await t.add(page, title)
    await written
  }
  const browser = await chromium.launch()
  try {
    const { page, errors } = await open(browser)
    await page.goto('/todos')
    await hydrated(page)
    await check('add shows the row and survives a reload', async () => {
      await add(page, 'Milk')
      await add(page, 'Bread')
      await page.reload()
      await hydrated(page)
      eq(await titles(page), ['open:Milk', 'open:Bread'], 'rows')
    })
    await check('a hostile title is stored as text', async () => {
      const title = `'); drop table todos; --`
      await add(page, title)
      await page.reload()
      await hydrated(page)
      eq((await titles(page)).at(-1), `open:${title}`, 'title')
    })
    await check('toggle and delete persist', async () => {
      const written = page.waitForResponse(
        (r) => r.url().includes('/_kerf/fn/') && r.request().method() === 'POST',
      )
      await page.getByRole('checkbox').first().check()
      await written
      const deleted = page.waitForResponse(
        (r) => r.url().includes('/_kerf/fn/') && r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Delete Bread' }).click()
      await page.getByRole('button', { name: 'Delete Bread' }).waitFor({ state: 'detached' })
      await deleted
      await page.reload()
      await hydrated(page)
      eq(await page.getByRole('checkbox').first().isChecked(), true, 'checked')
      eq(
        (await titles(page)).some((title) => title.includes('Bread')),
        false,
        'deleted',
      )
    })
    eq(errors, [], 'page errors')
  } finally {
    await browser.close()
  }
  return { checks: t.checks }
}
