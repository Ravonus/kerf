import type { DocGroup } from '../types.ts'
import { notifications } from './live/notifications.ts'
import { sessions } from './live/sessions.ts'

export const live: DocGroup = {
  file: 'live',
  title: 'Live',
  intro: 'Feeds, notifications and rooms that update on their own.',
  pack: true,
  docs: [...notifications, ...sessions],
}
