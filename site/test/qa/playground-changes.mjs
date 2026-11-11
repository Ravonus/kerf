import { base, check, same, printed } from './context.mjs'

await check('a knob changes the preview and the code', '/components/button', async (page) => {
  await page.locator('#playground').scrollIntoViewIfNeeded()
  await page.waitForSelector('#playground [data-part="mount"][data-ready] [data-scope="button"]', {
    timeout: 8000,
  })
  const shown = () =>
    page.evaluate(() => {
      const bx = document.querySelector('#playground [data-part="mount"] [data-scope="button"]')
      return bx && { size: bx.dataset.size ?? 'md', tone: bx.dataset.tone ?? 'accent' }
    }) // a default is left off the element
  same((await shown()).size, 'md', 'start size')
  await page
    .locator(
      '#playground [data-part="knob"]:has([data-part="knob-label"]:text-is("Size")) label:has(input[value="lg"])',
    )
    .click()
  await printed(page, 'size="lg"')
  await page.waitForFunction(
    () =>
      document.querySelector('#playground [data-part="mount"] [data-scope="button"]')?.dataset
        .size === 'lg',
    null,
    { timeout: 4000 },
  )
  await page
    .locator(
      '#playground [data-part="knob"]:has([data-part="knob-label"]:text-is("Tone")) label:has(input[value="critical"])',
    )
    .click()
  await printed(page, 'tone="critical"')
  await page.waitForFunction(
    () =>
      document.querySelector('#playground [data-part="mount"] [data-scope="button"]')?.dataset
        .tone === 'critical',
    null,
    { timeout: 4000 },
  )
  same(new URL(page.url()).searchParams.get('tone'), 'critical', 'the address keeps it')
  await page.locator('#playground [data-part="knobs-head"] button').click()
  await printed(page, '<Button>Deploy</Button>')
  same(JSON.stringify(await shown()), JSON.stringify({ size: 'md', tone: 'accent' }), 'after reset')
})

// The playground's stage takes the page's themes and expressions, and its own.
await check(
  'the playground stage switches theme and expression',
  '/components/button',
  async (page) => {
    await page.locator('#playground').scrollIntoViewIfNeeded()
    await page.waitForSelector('#playground [data-part="mount"][data-ready]', { timeout: 8000 })
    const stage = page.locator('#playground [data-part="pair"] > [data-part="stage"]')
    await page.locator('#playground [data-act="stage-theme"]').click()
    same(await stage.getAttribute('data-theme'), 'light', 'theme')
    await page.locator('#playground [data-act="stage-theme"]').click()
    same(await stage.getAttribute('data-theme'), 'dark', 'theme')
    const seen = new Set()
    for (let i = 0; i < 3; i++) {
      await page.locator('#playground [data-act="stage-expression"]').click()
      seen.add(await stage.getAttribute('data-expression'))
    }
    same([...seen].sort((x, y) => x.localeCompare(y)).join(), 'balanced,quiet,vivid', 'expressions')
    same(
      await page.locator('#playground [data-part="mount"] [data-scope="button"]').count(),
      1,
      'the button is still there',
    )
  },
)

// Every page with a playground draws it: the component on the stage, the code printed, no error on the way.
await check('every playground renders', '/components', async (page) => {
  const { readFileSync } = await import('node:fs')
  const pages = JSON.parse(
    readFileSync(
      new URL('../src/generated/toolkit.json', new URL('../qa.mjs', import.meta.url)),
      'utf8',
    ),
  )
  const paths = Object.values(pages)
    .filter((p) => p.playground)
    .map((p) => `/${p.area}/${p.slug}`)
  if (paths.length < 40) throw new Error(`only ${paths.length} playgrounds`)
  const bad = []
  let errors = []
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]))
  for (const path of paths) {
    errors = []
    await page.goto(base + path, { waitUntil: 'load' })
    await page.locator('#playground').scrollIntoViewIfNeeded()
    const ok = await page
      .waitForSelector('#playground [data-part="mount"][data-ready]', { timeout: 8000 })
      .then(
        () => true,
        () => false,
      )
    await page.waitForTimeout(150)
    const r = await page.evaluate(() => ({
      kids: document.querySelector('#playground [data-part="mount"]')?.childElementCount ?? 0,
      code:
        document.querySelector('#playground [data-play] > [data-part="code"] pre')?.innerText ?? '',
      failed: /failed to load/.test(document.querySelector('#playground')?.textContent ?? ''),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    const why = [
      !ok && 'never mounted',
      !r.kids && 'empty stage',
      !/from '@kerf\/veneer'/.test(r.code) && 'no code',
      r.failed && 'failed to load',
      r.over > 0 && `overflows ${r.over}px`,
      ...errors,
    ].filter(Boolean)
    if (why.length) bad.push(`${path} (${why.join(', ')})`)
  }
  same(bad.join('; '), '', 'playgrounds')
})
