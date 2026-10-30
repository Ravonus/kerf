export const load = async () => {
  throw new Error('loader exploded')
}

export default function Boom() {
  return <p>unreachable</p>
}
