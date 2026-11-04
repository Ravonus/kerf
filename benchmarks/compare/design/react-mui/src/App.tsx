import { useEffect, useState } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { theme } from './theme'
import { Layout } from './Layout'
import { Settings } from './Settings'
import { Customers } from './Customers'
import { Pricing } from './Pricing'

const screens: Record<string, () => React.ReactElement> = {
  '/settings': Settings,
  '/customers': Customers,
  '/pricing': Pricing,
}

const read = () => {
  const p = window.location.hash.replace(/^#/, '')
  return p in screens ? p : '/settings'
}

export function App() {
  const [path, setPath] = useState(read)
  useEffect(() => {
    const on = () => {
      setPath(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const Screen = screens[path]
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline enableColorScheme />
      <Layout current={path}>
        <Screen />
      </Layout>
    </ThemeProvider>
  )
}
