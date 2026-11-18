export const prerender = true
export const meta = { title: 'Home' }

export default function Home() {
  if (typeof document === 'undefined') throw new Error('Static route rendered on the peer')
  return <h1>Release home</h1>
}
