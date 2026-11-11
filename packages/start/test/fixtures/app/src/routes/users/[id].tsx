import { notFound, type LoadArgs, type Meta, type Prerender, type RouteProps } from '@kerf-js/start'
import { db } from '../../db'

export const load = async ({ params }: LoadArgs<'/users/[id]'>) =>
  (await db.user(params.id)) ?? notFound()

export const meta: Meta<typeof load, '/users/[id]'> = ({ data }) => ({
  title: data.name,
  description: data.bio,
})

export const prerender: Prerender<'/users/[id]'> = [{ id: '1' }]

export default function User(props: RouteProps<typeof load, '/users/[id]'>) {
  return (
    <article>
      <h2>{props.data.name}</h2>
      <p class="bio">{props.data.bio}</p>
      <p class="id">#{props.params.id}</p>
    </article>
  )
}
