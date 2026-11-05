import { settingsDocs } from './admin-settings.ts'
import { billingDocs } from './admin-billing.ts'
import { operationsDocs } from './admin-operations.ts'
import type { DocGroup } from '../types.ts'

export const admin: DocGroup = {
  file: 'admin',
  title: 'Admin',
  intro: 'Settings, plans, members and the screens around them.',
  pack: true,
  docs: [...settingsDocs, ...billingDocs, ...operationsDocs],
}
