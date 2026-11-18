import { message } from '../../server/message'
import './details.css'

export default function Details() {
  const data = message()
  return <p class="details">{data.value}</p>
}
