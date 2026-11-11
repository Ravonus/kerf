import { redirect } from '@kerf-js/start'
import { Moved } from '../../components/Moved'

// /toolkit became /components. Not prerendered: the server answers 308 with the new address.
export const load = () => redirect('/components', 308)

export default function Old() {
  return <Moved to="/components" />
}
