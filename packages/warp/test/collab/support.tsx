import { fireEvent } from '@testing-library/dom'
import { flush } from '@weft-js/core/test'
import type { ChatMessage, Peer } from '@weft-js/warp-core'

export const mei: Peer = { id: 'mei', name: 'Mei Tanaka', color: 3 }

export const ana: Peer = { id: 'ana', name: 'Ana Ruiz', color: 1 }

export const kofi: Peer = { id: 'kofi', name: 'Kofi Mensah', color: 2 }

export const me: Peer = { id: 'me', name: 'Jo', color: 6 }

export const msg = (
  id: string,
  author: Peer,
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({ id, author, text, time: '09:48', day: 'Today', ...extra })

export const q = <T extends HTMLElement = HTMLElement>(r: ParentNode, s: string) =>
  r.querySelector<T>(s)!

export const qa = <T extends HTMLElement = HTMLElement>(r: ParentNode, s: string) => [
  ...r.querySelectorAll<T>(s),
]

export const button = (r: ParentNode, name: string) =>
  qa<HTMLButtonElement>(r, 'button').find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name,
  )!

export const type = (el: HTMLTextAreaElement | HTMLInputElement, v: string) => {
  el.value = v
  el.setSelectionRange?.(v.length, v.length)
  fireEvent.input(el)
}

export const polite = () => q(document, '[data-scope="announcer"][aria-live="polite"]').textContent

export const loud = () => q(document, '[data-scope="announcer"][aria-live="assertive"]').textContent

export const tick = async () => {
  await Promise.resolve()
  await flush()
  await Promise.resolve()
}
