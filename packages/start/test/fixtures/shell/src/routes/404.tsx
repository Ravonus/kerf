export const meta = { title: 'Release not found' }

export default function Missing(props: { data: { path: string } }) {
  return <h1>Release not found {props.data.path}</h1>
}
