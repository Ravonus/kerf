import { realtime } from '@weft-js/start'

// The docs example's two rows are the only keys anyone may share here.
export default realtime({ share: ({ key }) => key.startsWith('demo:') })
