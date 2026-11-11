import { redirect } from '@kerf/start'
import { Moved } from '../../components/Moved'

// /docs became Learn (the tutorial) and Reference (the API). Not prerendered: the server answers 308 with the new address.
export const load = () => redirect('/learn', 308)

export default function Old() {
  return <Moved to="/learn" />
}
