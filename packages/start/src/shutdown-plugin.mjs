// Nitro calls close after srvx has drained or forcibly closed HTTP connections.
import { onShutdown, serverDrained } from './server/shutdown.ts'

export default function shutdownPlugin(nitro) {
  if (typeof process !== 'undefined' && !process.env.KERF_BUILD) onShutdown()
  nitro.hooks.hook('close', serverDrained)
}
