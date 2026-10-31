import { Counter } from '../components/islands'

export const load = async () => ({ when: new Date(0) })

export default function IslandBad(props: { data: { when: Date } }) {
  return <main><Counter start={0} label={props.data.when as unknown as string} /></main>
}
