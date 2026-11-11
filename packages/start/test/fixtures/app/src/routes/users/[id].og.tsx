import type { OgProps } from '@kerf/start'
import type { load } from './[id]'

export const fonts = ['Inter:400,700']

export default function UserCard(props: OgProps<typeof load, '/users/[id]'>) {
  return (
    <div style="display:flex;flex-direction:column;justify-content:center;width:100%;height:100%;padding:80px;background-color:#0b0b0f;color:#ffffff;font-family:Inter">
      <h1 style="margin:0;font-size:84px;font-weight:700">{props.data.name}</h1>
      <p style="margin:24px 0 0 0;font-size:36px;color:#b4b4c4">
        {props.site.name} · user #{props.params.id}
      </p>
    </div>
  )
}
