import { realtime } from '@weft-js/start'

// Who may share a key with other clients. `/ui-state` has a `secret:` row, which stays in this browser.
export default realtime({ share: ({ key }) => !key.startsWith('secret:') })
