import { redirect } from '@weft-js/start'

export const load = () => redirect('/todos')

export default function Home() {
  return null
}
