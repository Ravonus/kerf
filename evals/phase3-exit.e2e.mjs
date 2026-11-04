// The hidden e2e for evals/phase3-exit.mjs: everything the scaffold promised (scripts/e2e-todo.mjs), then the sharing
// feature from the brief, through the UI and by calling server functions directly. Accounts are generated per run.
import { createRequire } from 'node:module'
import { base, suite } from '../packages/start/scripts/e2e-todo.mjs'

const { chromium } = createRequire(new URL('../packages/start/package.json', import.meta.url))(
  'playwright-core',
)

export default async function ({ url, log }) {
  const t = suite({ url, log })
  const { check, eq, user, open, signUp, titles, add } = t
  const browser = await chromium.launch()
  try {
    const { a, b, bob, post } = await base(t, { url, browser })
    const c = await open(browser)
    const carol = user('carol')
    await signUp(c.page, carol)
    const shared = (page) =>
      page.$$eval('ul.shared li', (l) =>
        l.map(
          (li) =>
            `${li.classList.contains('done') ? 'done' : 'open'}:${li.querySelector('label')?.textContent.trim()}`,
        ),
      )
    const share = async (title, email) => {
      await a.page.getByRole('button', { name: `Share ${title}`, exact: true }).click()
      await a.page.getByLabel('Share with').fill(email)
      await a.page.getByRole('button', { name: 'Confirm share' }).click()
    }
    const bobReload = async () => {
      await b.page.goto('/todos')
      await b.page.waitForLoadState('networkidle')
    }
    const ids = await a.page.evaluate(() =>
      JSON.parse(document.getElementById('weft-cache').textContent)
        .find((w) => Array.isArray(w[2]) && w[2][0]?.title)[2]
        .map((x) => [x.title, x.id]),
    )
    const id = Object.fromEntries(ids)['Run the matrix']

    await check(
      'sharing with an unknown email shows `No such user` and shares nothing',
      async () => {
        await share('Run the matrix', `nobody-${Date.now()}@test.local`)
        await a.page.getByRole('alert').filter({ hasText: 'No such user' }).waitFor()
        await bobReload()
        eq(await shared(b.page), [], "bob's shared list")
      },
    )
    await check(
      'a shared todo appears under `Shared with me`, server-rendered, with no delete button',
      async () => {
        await a.page.reload()
        await a.page.waitForLoadState('networkidle')
        await share('Run the matrix', bob.email)
        await a.page.getByRole('button', { name: 'Unshare Run the matrix' }).waitFor()
        await bobReload()
        await b.page.getByRole('heading', { name: 'Shared with me' }).waitFor()
        eq(await shared(b.page), ['open:Run the matrix'], "bob's shared list")
        eq(await b.page.locator('ul.shared li button').count(), 0, 'buttons in the shared list')
        if (!(await (await b.context.request.get('/todos')).text()).includes('Run the matrix'))
          t.fail('not in the server-rendered page')
        eq(await titles(b.page), [], "bob's own list")
      },
    )
    await check('a hydrated shared list fetches nothing', async () => {
      const calls = []
      const listen = (r) => {
        if (r.url().includes('/_weft/fn/')) calls.push(r.url())
      }
      b.page.on('request', listen)
      await b.page.reload()
      await b.page.waitForLoadState('networkidle')
      b.page.off('request', listen)
      eq(calls, [], 'fetches during hydration')
    })
    await check('the recipient toggles it without a reload; the owner sees it', async () => {
      await b.page.locator('ul.shared li').getByRole('checkbox').click()
      await b.page.locator('ul.shared li.done').waitFor()
      await a.page.reload()
      await a.page.waitForLoadState('networkidle')
      eq(await titles(a.page), ['done:Write the note', 'done:Run the matrix'], "alice's list")
    })
    await check("the owner's toggle reaches the recipient's list on their next load", async () => {
      await a.page
        .locator('ul.todos li', { hasText: 'Run the matrix' })
        .getByRole('checkbox')
        .click()
      await a.page
        .locator('ul.todos li', { hasText: 'Run the matrix' })
        .and(a.page.locator(':not(.done)'))
        .waitFor()
      await a.page.waitForLoadState('networkidle')
      await bobReload()
      eq(await shared(b.page), ['open:Run the matrix'], "bob's list")
    })
    await check("a third user can't read, toggle or share it, by any id", async () => {
      eq(await shared(c.page), [], "carol's list")
      await post(c.context, 'toggleTodo', { id })
      await post(c.context, 'shareTodo', { id, email: carol.email })
      await post(b.context, 'shareTodo', { id, email: carol.email }) // a recipient isn't the owner either
      await c.page.goto('/todos')
      await c.page.waitForLoadState('networkidle')
      eq(await shared(c.page), [], 'carol after trying to share to herself')
      await bobReload()
      eq(await shared(b.page), ['open:Run the matrix'], 'unchanged')
    })
    await check("a recipient can't delete it or take the share back", async () => {
      await post(b.context, 'deleteTodo', { id })
      await post(b.context, 'unshareTodo', { id })
      await bobReload()
      eq(await shared(b.page), ['open:Run the matrix'], 'still shared')
    })
    await check('unshare removes it; the recipient can no longer toggle it', async () => {
      await a.page.reload()
      await a.page.waitForLoadState('networkidle')
      await a.page.getByRole('button', { name: 'Unshare Run the matrix' }).click()
      await a.page.getByRole('button', { name: 'Share Run the matrix', exact: true }).waitFor()
      await post(b.context, 'toggleTodo', { id })
      await bobReload()
      eq(await shared(b.page), [], "bob's list")
      await a.page.reload()
      await a.page.waitForLoadState('networkidle')
      eq(
        await titles(a.page),
        ['done:Write the note', 'open:Run the matrix'],
        "alice's list unchanged",
      )
    })
    await check("the owner's list still adds, and no page threw", async () => {
      await add(a.page, 'After sharing')
      eq([...a.errors, ...b.errors, ...c.errors], [], 'page errors')
    })
    return { checks: t.checks }
  } finally {
    await browser.close()
  }
}
