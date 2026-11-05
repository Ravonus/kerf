import { DEV, rt } from '../index/graph'
import type { Box } from '../index'
import type { App, Instance, features, owners, StateError } from '../scope'

type Deps = {
  features: typeof features
  owners: typeof owners
  onWrite: (box: Box<unknown>, before: unknown) => void
  StateError: typeof StateError
}

export function attachBoxes(
  inst: Instance,
  boxes: Box<unknown>[],
  named: Map<Box<unknown>, string>,
  app: App,
  def: { name: string },
  { features, owners, onWrite, StateError }: Deps,
) {
  const seed = app.seed[def.name] ?? rt.state?.[def.name] ?? {}
  if (rt.state) delete rt.state[def.name]
  for (const box of boxes) {
    const name = box.opts?.name ?? named.get(box)
    if (DEV) box.n = `${def.name}.${name ?? '#'}`
    inst.inits.set(box, box.v)
    owners.set(box, inst)
    if (box.opts?.persist) {
      if (DEV && !features.persist)
        throw new StateError(
          'S008',
          `\`${def.name}\` persists a box, but @weft-js/core/persist isn't loaded`,
          "the weft() Vite plugin adds it; without the plugin, `import '@weft-js/core/persist'`",
        )
      if (DEV && !name)
        throw new StateError(
          'S008',
          `\`${def.name}\` persists a box it doesn't return or name`,
          "return it from the setup, or give it `name: '…'`",
        )
      features.persist!.load(inst, box, name!)
    }
    if (name && name in seed) box.v = seed[name] // before setup returns: nothing has read it yet
    if (box.opts?.sync) {
      if (DEV && !features.sync)
        throw new StateError(
          'S008',
          `\`${def.name}\` syncs a box, but @weft-js/core/sync isn't loaded`,
          "the weft() Vite plugin adds it; without the plugin, `import '@weft-js/core/sync'`",
        )
      if (DEV && !name)
        throw new StateError(
          'S008',
          `\`${def.name}\` syncs a box it doesn't return or name`,
          "return it from the setup, or give it `name: '…'`",
        )
      features.sync!.attach(inst, box, name!)
    }
    box.h = onWrite
  }
}
