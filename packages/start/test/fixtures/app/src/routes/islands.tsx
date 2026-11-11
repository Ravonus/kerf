import type { RouteProps } from '@kerf-js/start'
import { Counter, Fold, Label, Reveal, Stocked, Twice } from '../components/islands'

export const load = async () => ({
  start: 5,
  note: 'From the server',
  items: [
    { id: 'a', n: 1 },
    { id: 'b', n: 2 },
  ],
})

export default function Islands(props: RouteProps<typeof load>) {
  return (
    <main class="islands">
      <h1>Mostly static</h1>
      <Label text={props.data.note} />
      <Counter start={props.data.start} label="solo" />
      <ul class="rows">
        {props.data.items.map((i) => (
          <li key={i.id} class="row">
            {i.id}
            <Counter start={i.n} label={i.id} />
          </li>
        ))}
      </ul>
      <Fold title="fold">
        <p class="kept">{props.data.note}</p>
      </Fold>
      <Reveal>
        <p class="late">{props.data.note}</p>
      </Reveal>
      <Stocked n={7} />
      <Twice>both places</Twice>
    </main>
  )
}
