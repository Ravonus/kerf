import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useAction } from "@solidjs/router";

import { signOutAction } from "~/lib/data";
import { avatar } from "./button";

export default function AccountPanel(props: { name: string; email: string }) {
  const signOut = useAction(signOutAction);

  return (
    <DropdownMenu defaultOpen placement="bottom-end" gutter={8}>
      <DropdownMenu.Trigger aria-label="Account" class={avatar}>
        {props.name.charAt(0).toUpperCase()}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="z-20 min-w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg outline-none">
          <div class="px-3 py-2">
            <p class="text-sm font-medium">{props.name}</p>
            <p class="text-sm text-muted">{props.email}</p>
          </div>
          <DropdownMenu.Separator class="my-1 h-px border-none bg-line" />
          <DropdownMenu.Item onSelect={() => signOut()} class="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium outline-none data-highlighted:bg-sunken">
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
}
