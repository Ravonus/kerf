import type { BootstrapProvider } from '@kerf-js/start'
import type bootstrap from './bootstrap'

const provide: BootstrapProvider<typeof bootstrap> = async ({ request }) => {
  if (new URL(request.url).searchParams.has('delay'))
    await new Promise((done) => setTimeout(done, 500))
  return { peer: request.headers.get('x-fixture-peer') ?? 'direct' }
}
export default provide
