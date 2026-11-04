export function Card(props) {
  return <h2>{props.title}</h2>
}
export function Shared(props) {
  return <p>{props.n + 1}</p>
}
export function Lonely(props) {
  return <p>{props.z}</p>
}
