'use client'

import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'

const links = [
  { href: '/admin', label: 'Overview', segment: null },
  { href: '/admin/orders', label: 'Orders', segment: 'orders' },
  { href: '/admin/nested', label: 'Regions', segment: 'nested' },
  { href: '/admin/per-row', label: 'Order feed', segment: 'per-row' },
  { href: '/admin/slow', label: 'Year report', segment: 'slow' },
]

export function NavLinks({ active }: { active?: string | null }) {
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto text-sm font-medium lg:flex-col">
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.segment === active ? 'page' : undefined}
          className="shrink-0 rounded-lg px-3 py-2 text-muted transition-colors hover:bg-tint hover:text-ink aria-[current=page]:bg-tint aria-[current=page]:text-accent-strong"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

export function AdminNav() {
  return <NavLinks active={useSelectedLayoutSegment()} />
}
