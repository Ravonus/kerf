import { Boundary, state } from '@kerf-js/core'
import { admitOperation, Form, ShellDataError, type Meta, type RouteProps } from '@kerf-js/start'
import { z } from 'zod'
import {
  probeChannel,
  probeMutation,
  probeQuery,
  probeShared,
  probeStream,
  refuseMutation,
} from '../server/critic'

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

const errorCode = (error: unknown) => (error instanceof ShellDataError ? error.code : 'unexpected')

function Current() {
  const current = probeQuery()
  return <output data-refresh>{current.value?.text}</output>
}

export default function Critic(props: RouteProps<typeof load>) {
  const query = state('Idle')
  const direct = state('Idle')
  const action = state('Idle')
  return (
    <>
      <h1>{props.data.label}</h1>
      <button
        type="button"
        onClick={() => {
          void probeQuery.fetch().then(
            (value) => (query.value = value.text),
            (failure) => (query.value = errorCode(failure)),
          )
        }}
      >
        Read server function
      </button>
      <button
        type="button"
        onClick={() => {
          const path = `/peers/${sessionStorage.peer}/_kerf/fn/${probeQuery.$id}`
          const attack = sessionStorage.operationAttack
          const target = path + (attack ? '?operationAttack=' + attack : '')
          void fetch(target, { redirect: 'error', credentials: 'omit' })
            .then((response) => admitOperation(probeQuery, response))
            .then(
              (value) => {
                direct.value = value.text
              },
              (failure) => {
                direct.value = errorCode(failure)
              },
            )
        }}
      >
        Read through own transport
      </button>
      <button
        type="button"
        onClick={() => {
          void refuseMutation().catch((failure) => {
            action.value = errorCode(failure)
          })
        }}
      >
        Request refused mutation
      </button>
      <output data-query>{query.value}</output>
      <Boundary pending={<p>Query loading</p>} error={() => <p>Query refused</p>}>
        <Current />
      </Boundary>
      <output data-direct>{direct.value}</output>
      <output data-action>{action.value}</output>
      <ChannelProbe />
      <Form
        of={probeMutation}
        onError={(failure) => {
          action.value = errorCode(failure)
        }}
      >
        {(form) => (
          <>
            <button type="submit">Submit server form</button>
            <output data-form>{form.result.value?.text}</output>
          </>
        )}
      </Form>
    </>
  )
}

function ChannelProbe() {
  const sendError = state('')
  const connection = probeChannel.connect(undefined, { keep: 0 })
  const notices = connection.collect('notice')
  const shared = probeShared.connect('critic', { keep: 0 })
  const stream = probeStream(undefined, { keep: 0 })
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void connection.send('request', null).catch((failure) => {
            sendError.value = errorCode(failure)
          })
        }}
      >
        Request channel message
      </button>
      <output data-channel>{connection.status.value}</output>
      <output data-notice>{notices.value.at(-1)?.text}</output>
      <output data-channel-error>{errorCode(connection.error)}</output>
      <output data-send-error>{sendError.value}</output>
      <output data-stream>{stream.value?.text}</output>
      <output data-stream-error>{errorCode(stream.error)}</output>
      <output data-shared>
        {shared.status.value} {shared.value}
      </output>
    </>
  )
}
