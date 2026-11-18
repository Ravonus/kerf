import { state } from '@kerf-js/core'
import bootstrap from '../bootstrap'

export const prerender = true
export const meta = { title: 'Home' }

export default function Home() {
  if (typeof document === 'undefined') throw new Error('Static route rendered on the peer')
  const error = state('')
  return (
    <>
      <h1>Release home</h1>
      <output data-bootstrap>{bootstrap.read().peer}</output>
      <output data-bootstrap-error>{error.value}</output>
      <button
        onClick={() => {
          error.value = ''
          void bootstrap.refresh().catch((failure) => {
            error.value = failure.code
          })
        }}
      >
        Read bootstrap again
      </button>
    </>
  )
}
