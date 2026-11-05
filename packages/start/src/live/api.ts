import type { LiveApi } from '../data'

// `data.ts` hands these over (`use`). A static import would close a cycle with its `import('./live')`, and the bundler
// would then keep this chunk, the hub and the split they force in apps that never read `.live`.
export let cache: LiveApi['cache'],
  currentScope: LiveApi['currentScope'],
  fns: LiveApi['fns'],
  FnError: LiveApi['FnError'],
  keyOf: LiveApi['keyOf'],
  net: LiveApi['net'],
  rt: LiveApi['rt'],
  runtime: LiveApi['runtime'],
  skip: LiveApi['skip'],
  StartError: LiveApi['StartError'],
  track: LiveApi['track']
export const use = (api: LiveApi) =>
  void ({ cache, currentScope, fns, FnError, keyOf, net, rt, runtime, skip, StartError, track } =
    api)
