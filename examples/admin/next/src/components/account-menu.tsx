'use client'

import * as Menu from '@radix-ui/react-dropdown-menu'
import { signOut } from '@/server/account'

export function AccountMenu({ name, email }: { name: string; email: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Account"
        className="grid size-9 cursor-pointer place-items-center rounded-full bg-tint text-sm font-semibold text-accent-strong outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-accent/40 data-[state=open]:ring-3 data-[state=open]:ring-accent/25"
      >
        {name.charAt(0).toUpperCase()}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="z-20 min-w-56 rounded-xl border border-line bg-raised p-1.5 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-sm text-muted">{email}</p>
          </div>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item
            onSelect={() => signOut()}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium outline-none data-highlighted:bg-tint"
          >
            Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
