// Exercise changing CMS-like media through the real handler after its route head has been remembered.
import { resource } from '@kerf-js/core'
import { createHandler } from '../src/server'
function Artwork(props: { data: { source: string } }) {
  const value = resource(
    () =>
      new Promise<string>((resolve) => {
        setTimeout(() => resolve(props.data.source), 8)
      }),
  )
  return (
    <main>
      <img src={value.value ?? ''} width={640} height={640} alt="Artwork" fetchpriority="high" />
    </main>
  )
}
test('each response preloads its current image before modules, never a remembered media URL', async () => {
  const handle = createHandler({
    manifest: {
      dir: 'src/routes',
      layouts: [],
      routes: [{ id: '/', file: 'index', pattern: '/', params: [], layouts: [], kind: 'page' }],
    },
    modules: {
      index: {
        default: Artwork,
        load: ({ request }) => ({
          source: new URL(request.url).searchParams.get('asset') ?? '/first.avif',
        }),
        meta: { title: 'Art', description: 'The currently published artwork.' },
      },
    },
    site: { url: 'https://art.test', name: 'Art' },
    assets: { entry: '/client.js', js: [{ href: '/runtime.js' }] },
  })
  for (const image of ['/first.avif', '/second.avif', '/third.avif']) {
    const response = await handle(
      new Request('https://art.test/?asset=' + encodeURIComponent(image)),
    )
    expect(response.status).toBe(200)
    const html = await response.text(),
      head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain(`as="image" fetchpriority="high" href="${image}"`)
    expect(head.indexOf('as="image"')).toBeLessThan(head.indexOf('rel="modulepreload"'))
    for (const old of ['/first.avif', '/second.avif', '/third.avif'].filter((p) => p !== image))
      expect(head).not.toContain(old)
  }
})
