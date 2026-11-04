import { state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'
import { Shell } from '@weft-js/warp'
import { NAV } from '../../shared/data'
import { screens } from './screens'

function App() {
  const route = state('projects')
  const nav = [{ label: 'Workspace', items: NAV.map((n) => ({ ...n, href: `#${n.id}` })) }]
  const View = screens[Number(location.hash.slice(1)) || 0]
  return (
    <Shell
      brand={{ name: 'Loom' }}
      title="Projects"
      nav={nav}
      current={route.value}
      account={{
        name: 'Ana Ruiz',
        email: 'ana@loom.example',
        initials: 'AR',
        items: [
          { label: 'Profile', href: '#' },
          { label: 'Sign out', tone: 'critical' },
        ],
      }}
    >
      <View />
    </Shell>
  )
}
render(() => <App />, document.getElementById('root')!)
