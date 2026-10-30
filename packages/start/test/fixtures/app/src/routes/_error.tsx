export const meta = { title: 'Something broke' }

export default function Failed(props: { data: { status: number; message: string } }) {
  return <h1 class="error">Error {props.data.status}: {props.data.message}</h1>
}
