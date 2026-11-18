import { Boundary, resource } from '@kerf-js/core'
import {
  isRouteUrl,
  notFound,
  routeReturnTo,
  type LoadArgs,
  type Meta,
  type RouteDataSchema,
  type RouteProps,
} from '@kerf-js/start'
import { z } from 'zod'

export const routeData = {
  initial: z.strictObject({
    name: z.string().max(120),
    link: z.string().refine((url) => isRouteUrl(url)),
  }),
  deferred: { detail: z.strictObject({ text: z.string().max(120) }) },
} satisfies RouteDataSchema

export function load({ request, params }: LoadArgs<'/items/[id]'>) {
  if (params.id === 'none') return notFound()
  const peer = request.headers.get('x-fixture-peer')
  const delay = new URL(request.url).searchParams.get('attack') ? 5 : 550
  return {
    name: peer === 'b' ? 'Peer B item' : 'Peer A item',
    link: '/docs/example',
    detail: new Promise<{ text: string }>((resolve) =>
      setTimeout(() => resolve({ text: 'Deferred detail ' + params.id }), delay),
    ),
  }
}

export const meta: Meta<typeof load, '/items/[id]'> = ({ params, data }) => ({
  title: data.name + ' ' + params.id,
  description: 'From the release',
  jsonLd: { '@type': 'Product', name: data.name },
})

function Detail(props: { value: Promise<{ text: string }> }) {
  const detail = resource(() => props.value)
  return <output>{detail.value?.text}</output>
}

export default function Item(props: RouteProps<typeof load, '/items/[id]'>) {
  if (typeof document === 'undefined') throw new Error('Item rendered on the peer')
  return (
    <article>
      <h1>
        {props.data.name} {props.params.id}
      </h1>
      <a href={props.data.link}>Documentation</a>
      <output data-return-to>{routeReturnTo('next') ?? 'No return route'}</output>
      <Boundary pending={<p>Waiting for detail</p>} error={() => <p>Detail unavailable</p>}>
        <Detail value={props.data.detail} />
      </Boundary>
    </article>
  )
}
