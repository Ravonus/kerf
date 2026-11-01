import { same, until } from '../helpers.mjs'

const open = async (page, base) => {
  await page.goto(base)
  await page.getByRole('heading', { level: 1, name: 'Todos' }).waitFor()
  await until('the page responds', async () => {
    const box = page.getByLabel('New todo')
    await box.fill('probe')
    await box.press('Enter')
    const n = await page.getByRole('list', { name: 'Todos' }).getByRole('listitem').count().catch(() => 0)
    if (n) await page.getByRole('button', { name: 'Delete probe' }).click()
    return n > 0
  })
}
const add = async (page, ...titles) => { for (const t of titles) { const b = page.getByLabel('New todo'); await b.fill(t); await b.press('Enter'); await page.getByRole('checkbox', { name: t, exact: true }).waitFor() } }
const list = page => page.getByRole('list', { name: 'Todos' })
const titles = async page => (await list(page).count()) ? (await list(page).getByRole('checkbox').evaluateAll(xs => xs.map(x => x.labels?.[0]?.textContent?.trim() || x.getAttribute('aria-label') || ''))) : []
const left = (page, text) => page.getByText(text, { exact: true }).first().waitFor()
const check = (page, name) => page.getByRole('checkbox', { name, exact: true }).click()
const filter = (page, name) => page.getByRole('button', { name, exact: true }).click()
const shown = (page, want) => until(`shows ${want}`, async () => JSON.stringify(await titles(page)) === JSON.stringify(want))

const t = (title, run) => ({ title, run })
export const tests = [
  t('Enter adds a trimmed todo and clears the input', async ({ page, base }) => {
    await open(page, base)
    await page.getByLabel('New todo').fill('  milk  ')
    await page.getByLabel('New todo').press('Enter')
    await shown(page, ['milk'])
    same(await page.getByLabel('New todo').inputValue(), '', 'input')
    // The edit field holds the stored text exactly: labels and accessible names collapse the whitespace this is about.
    await page.getByRole('button', { name: 'Edit milk', exact: true }).click()
    same(await page.getByLabel('Edit todo').inputValue(), 'milk', 'stored text')
  }),
  t('the Add button adds', async ({ page, base }) => {
    await open(page, base)
    await page.getByLabel('New todo').fill('eggs')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await shown(page, ['eggs'])
  }),
  t('blank text adds nothing', async ({ page, base }) => {
    await open(page, base)
    await page.getByLabel('New todo').fill('   ')
    await page.getByLabel('New todo').press('Enter')
    await page.waitForTimeout(150)
    same(await titles(page), [], 'titles')
  }),
  t('todos keep the order added, and the count is right and pluralised', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a', 'b')
    await shown(page, ['a', 'b'])
    await left(page, '2 items left')
    await check(page, 'a')
    await left(page, '1 item left')
    await check(page, 'b')
    await left(page, '0 items left')
  }),
  t('Delete removes only its todo', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a', 'b', 'c')
    await page.getByRole('button', { name: 'Delete b', exact: true }).click()
    await shown(page, ['a', 'c'])
  }),
  t('filters show the right todos and mark the selection', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a', 'b')
    await check(page, 'a')
    const pressed = async () => Promise.all(['All', 'Active', 'Completed'].map(n => page.getByRole('button', { name: n, exact: true }).getAttribute('aria-pressed')))
    same(await pressed(), ['true', 'false', 'false'], 'default')
    await filter(page, 'Active')
    await shown(page, ['b'])
    same(await pressed(), ['false', 'true', 'false'], 'active')
    await filter(page, 'Completed')
    await shown(page, ['a'])
    await filter(page, 'All')
    await shown(page, ['a', 'b'])
  }),
  t('a todo added under Completed is hidden but counted', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a')
    await check(page, 'a')
    await filter(page, 'Completed')
    await page.getByLabel('New todo').fill('b')
    await page.getByLabel('New todo').press('Enter')
    await left(page, '1 item left')
    await shown(page, ['a'])
  }),
  t('completing under Active removes it from view at once', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a', 'b')
    await filter(page, 'Active')
    await check(page, 'a')
    await shown(page, ['b'])
  }),
  t('Mark all as complete follows the rules and is hidden when empty', async ({ page, base }) => {
    await open(page, base)
    same(await page.getByRole('checkbox', { name: 'Mark all as complete' }).count(), 0, 'shown when empty')
    await add(page, 'a', 'b')
    const all = page.getByRole('checkbox', { name: 'Mark all as complete' })
    same(await all.isChecked(), false, 'starts unchecked')
    await all.click()
    await left(page, '0 items left')
    await until('checked', () => all.isChecked())
    await all.click()
    await left(page, '2 items left')
    await check(page, 'a'); await check(page, 'b')
    await until('checked once all are done by hand', () => all.isChecked())
    await check(page, 'a')
    await until('unchecked again', async () => !(await all.isChecked()))
  }),
  t('Clear completed appears only when useful and clears only those', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a', 'b')
    const clear = page.getByRole('button', { name: 'Clear completed' })
    same(await clear.count(), 0, 'shown with none completed')
    await check(page, 'a')
    await clear.click()
    await shown(page, ['b'])
    await until('hidden again', async () => (await clear.count()) === 0)
  }),
  t('Edit moves focus to the field, Enter saves trimmed text', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a')
    await page.getByRole('button', { name: 'Edit a', exact: true }).click()
    const box = page.getByLabel('Edit todo')
    same(await box.inputValue(), 'a', 'value')
    await until('focused', () => box.evaluate(x => x === document.activeElement))
    await box.fill('  b ')
    await box.press('Enter')
    await shown(page, ['b'])
  }),
  t('Escape cancels an edit', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a')
    await page.getByRole('button', { name: 'Edit a', exact: true }).click()
    await page.getByLabel('Edit todo').fill('zzz')
    await page.getByLabel('Edit todo').press('Escape')
    await shown(page, ['a'])
  }),
  t('saving blank text deletes the todo', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a', 'b')
    await page.getByRole('button', { name: 'Edit a', exact: true }).click()
    await page.getByLabel('Edit todo').fill('   ')
    await page.getByLabel('Edit todo').press('Enter')
    await shown(page, ['b'])
  }),
  t('todos, completion and filter survive a reload', async ({ page, base }) => {
    await open(page, base)
    await add(page, 'a', 'b')
    await check(page, 'a')
    await filter(page, 'Active')
    await shown(page, ['b'])
    await page.reload()
    await shown(page, ['b'])
    await left(page, '1 item left')
    await until('filter kept', async () => (await page.getByRole('button', { name: 'Active', exact: true }).getAttribute('aria-pressed')) === 'true')
    await filter(page, 'All')
    await shown(page, ['a', 'b'])
    await until('completion kept', () => page.getByRole('checkbox', { name: 'a', exact: true }).isChecked())
  }),
  t('no console errors through load, use and reload', async ({ page, base, problems }) => {
    await open(page, base)
    await add(page, 'a')
    await check(page, 'a')
    await page.reload()
    await shown(page, ['a'])
    await page.waitForTimeout(300)
    same(problems.filter(p => !/favicon/.test(p)), [], 'console errors')
  }),
]

/** Median ms from clicking a filter to the next paint, at 200 todos. Seeded through the UI so storage shape stays the app's. */
export async function interaction(page, base) {
  await open(page, base)
  for (let i = 0; i < 200; i++) { const b = page.getByLabel('New todo'); await b.fill(`t${i}`); await b.press('Enter') }
  await shown(page, Array.from({ length: 200 }, (_, i) => `t${i}`))
  const samples = await page.evaluate(async () => {
    const button = n => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === n)
    const out = []
    for (let i = 0; i < 12; i++) {
      const at = performance.now()
      button(i % 2 ? 'All' : 'Completed').click()
      await new Promise(r => requestAnimationFrame(() => setTimeout(r)))
      out.push(performance.now() - at)
    }
    return out.sort((a, b) => a - b)
  })
  return { filterSwitchMs: +samples[6].toFixed(1) }
}
