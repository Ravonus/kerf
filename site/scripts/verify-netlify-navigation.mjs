// Verify the published site's document and client-navigation routes against the actual Netlify artifact.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const entry = new URL('../.netlify/functions-internal/server/server.mjs', import.meta.url)
const { default: handle, config } = await import(entry.href)
assert.equal(config.path, '/*', 'Netlify must dispatch nested application URLs to this function')
assert.equal(config.preferStatic, true, 'Netlify should still serve prerendered documents directly')
const isExcluded = (path) =>
  config.excludedPath.some((rule) =>
    rule.endsWith('*') ? path.startsWith(rule.slice(0, -1)) : path === rule,
  )

for (const page of [
  '/learn',
  '/learn/quick-start',
  '/learn/loading-data',
  '/learn/working-with-agents',
  '/reference',
  '/components',
  '/blocks',
  '/charts',
  '/art',
  '/icons',
]) {
  const path = '/_kerf/data' + page
  assert.equal(isExcluded(path), false, `${path} must go to the Netlify function`)
  const response = await handle(
    new Request('https://kerfjs.netlify.app' + path, {
      headers: { accept: 'application/json' },
    }),
  )
  assert.equal(response.status, 200, `${path} failed`)
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/)
  const payload = await response.json()
  assert.equal(payload.p, page, `${path} returned the wrong route`)
  assert.equal(payload.s, 200)
  assert.ok(payload.m?.length, `${path} did not return route matches`)
  const html = await readFile(new URL(`../dist${page}.html`, import.meta.url), 'utf8')
  assert.match(html, /id="kerf-route"/, `${page} has no prerendered route payload`)
  assert.doesNotMatch(html, /<h1[^>]*>Something went wrong/)
}
console.log('Netlify build: direct documents and client navigation verified')
