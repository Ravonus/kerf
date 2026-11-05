import { Select } from '@weft-js/warp'
import { TARGET_OPTIONS } from './shared'

export const SelectGroups = () => (
  <Select label="Deploy to" options={TARGET_OPTIONS} defaultValue="staging" />
)
