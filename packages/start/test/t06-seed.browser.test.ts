import { build } from 'vite'
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('./t06-seed-entry.js', import.meta.url))

test.each([true, false])('a production query bundle reads with seed=%s', async (seeded) => {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 't06-entry',
        resolveId(id) {
          return id === entry ? entry : undefined
        },
        load(id) {
          if (id !== entry) return null
          return `import { query } from '@kerf-js/start/data';
          window.result = query({ $id: 'listTodos.108883' }).fetch();`
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: entry, output: { codeSplitting: false } },
    },
  })
  if (!Array.isArray(output) && !('output' in output)) throw new Error('Unexpected Vite watcher')
  const chunks = Array.isArray(output) ? output.flatMap((o) => o.output) : output.output
  const chunk = chunks.find((item) => item.type === 'chunk' && item.isEntry)
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing entry chunk')
  const code = chunk.code
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const requests: string[] = []
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (url.includes('/_kerf/fn/')) {
        requests.push(url)
        await route.fulfill({ json: { v: ['network'], t: [] } })
      } else {
        await route.fulfill({
          contentType: 'text/html',
          body: seeded
            ? `<script id="kerf-cache" type="application/json">[["listTodos.108883",null,["seed"],[]]]</script>`
            : '',
        })
      }
    })
    await page.goto('http://t06.local/')
    await page.addScriptTag({ type: 'module', content: code })
    await page.waitForFunction(() => 'result' in window, null, { timeout: 2000 })
    const result = await page.evaluate(
      async () => await (window as typeof window & { result: Promise<unknown> }).result,
    )
    expect({ result, requests }).toEqual(
      seeded
        ? { result: ['seed'], requests: [] }
        : { result: ['network'], requests: ['http://t06.local/_kerf/fn/listTodos.108883'] },
    )
  } finally {
    await browser.close()
  }
})
