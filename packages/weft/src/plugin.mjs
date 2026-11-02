// @weft-js/core/plugin: typed slots and declared contributions (PLAN §7c, research 13 §2.2–2.3).
// Plain JS with no dependencies: weft.config.ts loads it in Node, so nothing here may need a bundler.

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) freeze(v)
  }
  return value
}

/** A slot definition. Consumers import the generated `weft:slot/<id>` module; providers reference this object. */
export function defineSlot(slot) {
  if (!/^[a-z@][\w./@-]*\.[\w-]+$/.test(slot.id)) throw new Error(`slot id \`${slot.id}\` must look like \`<domain>.<name>\``)
  return freeze({ default: null, ...slot })
}

/** A provider of `slot`: where its implementation lives per side (module specifiers, loaded lazily). */
export function provide(slot, provider) {
  return freeze({ slot, versions: provider.versions ?? [slot.version], ...provider })
}

const clone = v => {
  try {
    return structuredClone(v)
  } catch {
    return v
  }
}

const pluginError = (code, message, extra) => Object.assign(new Error(message), { code, ...extra })

/** Options through a Standard Schema (`~standard.validate`), a parse function, or as given. */
function parse(schema, input, name) {
  if (!schema) return input ?? {}
  if (typeof schema === 'object' && schema['~standard']) {
    const result = schema['~standard'].validate(input ?? {})
    if (result instanceof Promise) throw pluginError('P115', `\`${name}\` options schema is async; plugin options are validated synchronously.`)
    if (result.issues?.length) {
      const issue = result.issues[0]
      const path = (issue.path ?? []).map(p => (typeof p === 'object' ? p.key : p)).join('.')
      throw pluginError('P115', `\`${name}\` option \`${path || '(root)'}\`: ${issue.message}`, { path })
    }
    return result.value
  }
  if (typeof schema === 'function') {
    try {
      return schema(input ?? {})
    } catch (error) {
      if (error?.code === 'P115') throw error
      const path = error?.path ?? ''
      throw pluginError('P115', `\`${name}\` option${path ? ` \`${path}\`` : 's'}: ${error?.message ?? error}`, { path })
    }
  }
  throw pluginError('P115', `\`${name}\` declares \`options\` that is neither a Standard Schema nor a function.`)
}

/**
 * `definePlugin(def)` returns the factory users call in weft.config.ts. The instance is plain data
 * (`{ name, version, provides, options }`) that `weft check` can read without running anything, plus a non-enumerable
 * `contribute(env)` that runs the plugin's pure `contribute()` and returns its frozen manifest.
 */
export function definePlugin(def) {
  const namespace = def.namespace ?? `${def.name.replace(/^@[^/]+\//, '').replace(/^plugin-/, '')}/`
  return input => {
    const options = parse(def.options, input, def.name)
    let manifest
    const contribute = env => freeze(def.contribute ? def.contribute(options, Object.freeze({ ...env })) ?? {} : {})
    // `provides` as config data: run contribute once with a neutral env to learn the slot ids (it is pure).
    try {
      manifest = contribute({ command: 'check', mode: 'development', root: '' })
    } catch {
      manifest = {}
    }
    const provides = (manifest.provides ?? []).map(p => (p.key ? { slot: p.slot.id, key: p.key } : p.slot.id))
    const instance = { name: def.name, version: def.version, provides, options: freeze(clone(options)) }
    Object.defineProperties(instance, {
      contribute: { value: contribute },
      weft: { value: def.weft ?? '*' },
      namespace: { value: namespace },
      permissions: { value: freeze({ ...(def.permissions ?? {}) }) },
    })
    return instance
  }
}
