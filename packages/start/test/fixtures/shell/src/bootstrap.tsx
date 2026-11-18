import { defineBootstrap } from '@kerf-js/start'
import { z } from 'zod'

export default defineBootstrap(z.strictObject({ peer: z.string().max(12) }), {
  pending: () => <p role="status">Release bootstrap pending</p>,
  failure: ({ error, retry }) => (
    <section>
      <h1>Release bootstrap failed</h1>
      <output>{error.code}</output>
      <button onClick={retry}>Retry bootstrap</button>
    </section>
  ),
})
