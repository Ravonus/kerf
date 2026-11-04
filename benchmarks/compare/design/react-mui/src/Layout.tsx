import { type ReactNode } from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'

export const routes = [
  { path: '/settings', label: 'Settings' },
  { path: '/customers', label: 'Customers' },
  { path: '/pricing', label: 'Pricing' },
] as const

export function Layout({ current, children }: { current: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: { xs: 1, sm: 3 }, flexWrap: 'wrap', py: { xs: 0.5, sm: 0 } }}>
          <Typography
            component="div"
            sx={{
              fontWeight: 800,
              fontSize: '1.2rem',
              color: 'primary.main',
              letterSpacing: '-0.02em',
            }}
          >
            Northwind
          </Typography>
          <Box component="nav" aria-label="Main" sx={{ display: 'flex', gap: 0.5 }}>
            {routes.map((r) => (
              <Button
                key={r.path}
                href={`#${r.path}`}
                color={current === r.path ? 'primary' : 'inherit'}
                variant={current === r.path ? 'contained' : 'text'}
                aria-current={current === r.path ? 'page' : undefined}
                size="small"
                sx={{ px: { xs: 1.25, sm: 2 } }}
              >
                {r.label}
              </Button>
            ))}
          </Box>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        {children}
      </Container>
    </Box>
  )
}
