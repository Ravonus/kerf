import { redirect } from '@weft/start'

export const load = () => redirect('/todos')

export default function Home() {
  return null
}
