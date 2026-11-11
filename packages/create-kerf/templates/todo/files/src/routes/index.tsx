import { redirect, type Meta } from '@kerf/start'

// Only ever seen as a redirect, but a link to the bare domain still gets a title and a card.
export const meta: Meta = {
  title: 'Daybook',
  description: 'Daybook is a plain, private list of what you mean to get done.',
}

export const load = () => redirect('/todos')

export default function Home() {
  return null
}
