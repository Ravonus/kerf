import type { RouteProps } from '@kerf-js/start'

export default function Docs(props: RouteProps<undefined, '/docs/[...parts]'>) {
  return <h1>Document {props.params.parts}</h1>
}
