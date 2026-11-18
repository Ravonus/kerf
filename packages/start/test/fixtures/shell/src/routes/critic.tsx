import { state } from '@kerf-js/core'
import { Form, type Meta, type RouteProps } from '@kerf-js/start'
import { z } from 'zod'
import { probeChannel, probeMutation, probeQuery, probeShared, probeStream } from '../server/critic'

const extra = z.strictObject({
  name: z.literal('critic-note'),
  content: z.string().max(100),
  id: z.string().max(100),
})
const link = z.strictObject({ rel: z.string().max(20), href: z.string().max(100) })

export const routeData = {
  initial: z.strictObject({ label: z.string().max(100), extra, link }),
}

export function load(): z.infer<typeof routeData.initial> {
  return {
    label: 'Release text',
    extra: { name: 'critic-note', content: 'Text content', id: 'extra-attribute' },
    link: { rel: 'alternate', href: '/docs/example' },
  }
}

export const meta: Meta<typeof load> = ({ data }) => ({
  title: data.label,
  extra: [data.extra, data.link],
  jsonLd: { label: data.label },
})

export default function Critic(props: RouteProps<typeof load>) {
  const query = state('Idle')
  const connection = probeChannel.connect()
  const shared = probeShared.connect('critic')
  const stream = probeStream(undefined, { initial: 'Release stream value' })
  return (
    <>
      <h1>{props.data.label}</h1>
      <button
        type="button"
        onClick={() => {
          void probeQuery.fetch().then(
            (value) => (query.value = value),
            () => (query.value = 'Query unavailable'),
          )
        }}
      >
        Read server function
      </button>
      <output data-query>{query.value}</output>
      <output data-channel>{connection.status.value}</output>
      <output data-stream>
        {stream.status.value} {stream.value}
      </output>
      <output data-shared>
        {shared.status.value} {shared.value}
      </output>
      <Form of={probeMutation}>
        {(form) => (
          <>
            <button type="submit">Submit server form</button>
            <output data-form>{form.message.value ?? form.result.value}</output>
          </>
        )}
      </Form>
    </>
  )
}
