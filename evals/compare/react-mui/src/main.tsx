import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import CssBaseline from '@mui/material/CssBaseline'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { NAV } from '../../shared/data'
import { screens } from './screens'

const Links = () => (
  <List component="nav" aria-label="Main">
    {NAV.map((n) => (
      <ListItemButton key={n.id} component="a" href={`#${n.id}`} selected={n.id === 'projects'}>
        {n.label}
      </ListItemButton>
    ))}
  </List>
)
function App() {
  const wide = useMediaQuery('(min-width:768px)')
  const [nav, setNav] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const View = screens[Number(location.hash.slice(1)) || 0]
  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <Drawer
        variant={wide ? 'permanent' : 'temporary'}
        open={wide || nav}
        onClose={() => setNav(false)}
        sx={{ width: wide ? 224 : 0, '& .MuiDrawer-paper': { width: 224 } }}
      >
        <Toolbar>
          <Typography fontWeight="bold">Loom</Typography>
        </Toolbar>
        <Links />
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar position="static" color="default" elevation={0}>
          <Toolbar>
            {!wide && (
              <IconButton aria-label="Open navigation" onClick={() => setNav(true)}>
                ☰
              </IconButton>
            )}
            <Typography sx={{ flex: 1 }}>Projects</Typography>
            <IconButton aria-label="Account" onClick={(e) => setMenu(e.currentTarget)}>
              <Avatar>AR</Avatar>
            </IconButton>
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              <MenuItem>Profile</MenuItem>
              <MenuItem>Sign out</MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: 3 }}>
          <View />
        </Box>
      </Box>
    </Box>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
