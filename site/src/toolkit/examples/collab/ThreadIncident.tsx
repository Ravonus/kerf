import { state } from '@weft-js/core'

import { PresenceStack, Spacer, Text, Thread } from '@weft-js/warp'

import type { ComposerSend, ChatMessage, MessageReaction } from '@weft-js/warp'

import { CHAT, MARA, PEERS, SAM } from '../../world'

import { wait, IN_CHANNEL } from './shared-wait'

// -- chat --

export function ThreadIncident() {
  const messages = state(CHAT)
  const typing = state<string[]>([])
  const add = (m: ChatMessage) => (messages.value = [...messages.value, m])
  const send = async ({ text, quote }: ComposerSend) => {
    const id = `m${messages.value.length + 1}`
    add({
      id,
      author: MARA,
      mine: true,
      text,
      quote,
      time: '09:30',
      day: 'Today',
      state: 'sending',
    })
    await wait(500)
    messages.value = messages.value.map((m) => (m.id === id ? { ...m, state: 'sent' } : m))
    typing.value = ['Sam Okafor']
    await wait(1400)
    typing.value = []
    add({ id: `${id}-r`, author: SAM, text: 'Got it, thanks.', time: '09:31', day: 'Today' })
  }
  const react = (m: ChatMessage, r: MessageReaction | null) => {
    const reactions = r ? [{ ...r, count: r.count + 1, mine: true }] : []
    messages.value = messages.value.map((x) => (x.id === m.id ? { ...x, reactions } : x))
  }
  return (
    <Thread
      label="incidents channel"
      height="480px"
      messages={messages}
      unreadFrom="m5"
      typing={typing}
      header={
        <>
          <Text role="label"># incidents</Text>
          <Spacer />
          <PresenceStack peers={IN_CHANNEL} label="In this channel" />
        </>
      }
      onSend={(m) => void send(m)}
      onReact={react}
      composer={{ label: 'Message #incidents', placeholder: 'Message #incidents', mentions: PEERS }}
    />
  )
}
