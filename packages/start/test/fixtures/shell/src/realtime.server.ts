import { realtime } from '@kerf-js/start'

export default realtime({
  origins: process.env.SHELL_FIXTURE_ORIGIN ? [process.env.SHELL_FIXTURE_ORIGIN] : [],
})
