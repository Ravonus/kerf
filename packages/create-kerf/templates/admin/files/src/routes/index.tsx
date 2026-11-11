import { redirect, type Meta } from '@kerf-js/start'

// Only ever seen as a redirect, but a link to the bare domain still gets a title and a card.
export const meta: Meta = {
  title: 'Backroom',
  description: 'Backroom runs the shop: orders, customers and revenue in one place.',
}

export const load = () => redirect('/admin')

export default function Home() {
  return null
}
