// Shared browser-test helpers for the UI state fixture.
export const sleep = (ms) =>
  new Promise((ok) => {
    setTimeout(ok, ms)
  })

export const person = (page, pane, name) => page.getByTestId(`${pane}-${name}`)
export const box = (page, pane, name) =>
  person(page, pane, name).locator('label[data-scope="checkbox"]')
const hold = (l) => l.evaluate((el) => el.hasAttribute('data-hold'))
export const lit = async (l, on = true) => {
  await expect.poll(() => hold(l), { timeout: 5000, interval: 10 }).toBe(on)
}
export const remote = async (l, on = true) => {
  await expect
    .poll(() => l.evaluate((el) => el.hasAttribute('data-remote')), { timeout: 5000, interval: 10 })
    .toBe(on)
}
export const stats = (page) => page.evaluate(() => ({ ...window.__share }))
export const leaderOf = async (pages) => {
  for (const p of pages) if ((await stats(p)).role === 'leader') return p
}
export const settled = async (page, n = 1) => {
  await expect.poll(async () => ((await stats(page)).conn ? 1 : 0), { timeout: 10_000 }).toBe(n)
}
export const away = (page) => page.mouse.move(2, 2)
