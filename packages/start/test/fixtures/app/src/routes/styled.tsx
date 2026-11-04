import { Badge } from '../components/badge'
import { save } from '../server/typed'
import './styled.css'

export const meta = { title: 'Styled' }

export default function Styled() {
  return (
    <h1 class="styled" onClick={() => save({ title: 'x' })}>
      <Badge />
    </h1>
  )
}
