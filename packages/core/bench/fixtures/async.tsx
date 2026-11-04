// <Boundary> + resource (test/fixtures/ssr/Users.tsx), rendered on the client.
import { render } from '@weft-js/core/dom'
import { Users } from '../../test/fixtures/ssr/Users'

render(
  () => <Users load={(id) => fetch(`/users/${id}`).then((r) => r.json())} />,
  document.getElementById('root')!,
)
