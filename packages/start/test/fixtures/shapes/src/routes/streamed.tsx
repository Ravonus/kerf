import { Boundary } from '@kerf/core'
import { Feed } from './index'

export default function Streamed() {
  return (
    <main>
      <Boundary pending="shape">
        <Feed limit={3} seed={4} v={9} />
      </Boundary>
    </main>
  )
}
