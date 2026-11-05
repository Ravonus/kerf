import type { DocGroup } from '../types.ts'
import { feedbackNotifications } from './feedback/notifications.ts'
import { feedbackStatus } from './feedback/status.ts'

export const feedback: DocGroup = {
  file: 'feedback',
  title: 'Feedback',
  intro: 'Telling people what just happened, or what is happening now.',
  docs: [...feedbackNotifications, ...feedbackStatus],
}
