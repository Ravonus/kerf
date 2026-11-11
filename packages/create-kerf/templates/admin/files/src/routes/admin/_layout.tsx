import {
  BarChartIcon,
  ClipboardListIcon,
  HomeIcon,
  ListIcon,
  LogOutIcon,
  StoreIcon,
} from '@kerf-js/veneer-icons'
import { redirect, type LoadArgs, type RouteProps } from '@kerf-js/start'
import { Shell, Toaster, toast } from '@kerf-js/veneer'
import { Logo } from '#/components/Logo'
import { signOut } from '#/server/session'

const pages = {
  '/admin': { id: 'overview', label: 'Overview' },
  '/admin/orders': { id: 'orders', label: 'Orders' },
  '/admin/nested': { id: 'regions', label: 'Regions' },
  '/admin/per-row': { id: 'buyers', label: 'Order feed' },
  '/admin/slow': { id: 'report', label: 'Year report' },
}

// The guard for every page under /admin; each page's own queries are `auth: 'user'` as well.
export const load = ({ ctx, request }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
  const path = new URL(request.url).pathname.replace(/\/$/, '')
  const detail = path.match(/^\/admin\/orders\/(.+)$/)
  const page = pages[(detail ? '/admin/orders' : path) as keyof typeof pages] ?? pages['/admin']
  const crumbs = [
    { label: 'Backroom', href: '/admin' },
    ...(detail
      ? [{ label: 'Orders', href: '/admin/orders' }, { label: `#${detail[1]}` }]
      : [{ label: page.label }]),
  ]
  return { name: ctx.user.name, email: ctx.user.email, current: page.id, crumbs }
}

const nav = [
  {
    items: [
      { id: 'overview', label: 'Overview', href: '/admin', icon: HomeIcon },
      { id: 'orders', label: 'Orders', href: '/admin/orders', icon: ClipboardListIcon },
    ],
  },
  {
    label: 'Reports',
    items: [
      { id: 'regions', label: 'Regions', href: '/admin/nested', icon: StoreIcon },
      { id: 'buyers', label: 'Order feed', href: '/admin/per-row', icon: ListIcon },
      { id: 'report', label: 'Year report', href: '/admin/slow', icon: BarChartIcon },
    ],
  },
]

const leave = () =>
  signOut().catch(() =>
    toast.show({
      tone: 'critical',
      title: "You're still signed in",
      description: "That didn't go through. Try again in a moment.",
    }),
  )
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

export default function Admin(props: RouteProps<typeof load>) {
  return (
    <Shell
      brand={{ name: 'Backroom', href: '/admin', mark: <Logo /> }}
      nav={nav}
      current={props.data.current}
      crumbs={props.data.crumbs}
      account={{
        name: props.data.name,
        email: props.data.email,
        initials: initials(props.data.name),
        items: [{ label: 'Sign out', icon: LogOutIcon, onSelect: leave }],
      }}
      overlays={<Toaster />}
    >
      <div class="page">{props.children}</div>
    </Shell>
  )
}
