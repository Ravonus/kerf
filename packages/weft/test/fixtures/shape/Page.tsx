import { Boundary } from '@weft-js/core'
import { Feed, type Post } from './Feed'

export function Page(props: { shape?: Post[]; effects?: string[] }) {
  return <Boundary pending="shape"><Feed shape={props.shape} effects={props.effects} /></Boundary>
}
