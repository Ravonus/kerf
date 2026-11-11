import type { PublishOptions } from '../channel'
import { stable, StartError, type Fn } from '../data'
import { hub } from '../hub'
import { check } from './check'

const roomName = (id: string, params: unknown) => `kerf:c:${id}:${stable(params)}`

/** `room.publish` and `room.in(params).publish`. */
export async function publish(
  fn: Fn,
  params: unknown,
  name: string,
  message: unknown,
  o: PublishOptions & { from?: string } = {},
) {
  const h = hub()
  const valid = await check(
    fn.kind === 'shared' ? fn.def.key : fn.def.params,
    params,
    `\`${fn.$id}\`'s params`,
  )
  if (h.dev) {
    const schema = Object.hasOwn(fn.def.server ?? {}, name) ? fn.def.server![name] : undefined
    if (!schema)
      throw new StartError(
        'C002',
        `\`${fn.$id}\` has no server message \`${name}\``,
        'add it to `server`',
        { status: 500 },
      )
    const r = await schema['~standard'].validate(message)
    if (r.issues)
      throw new StartError(
        'C002',
        `\`${fn.$id}.${name}\` was published with a message its schema rejects: ${r.issues.map((i) => i.message).join('; ')}`,
        'fix the message, or the schema',
        { status: 500 },
      )
  }
  // `v` first: the hub reads it off the front of the string, to leave the ring alone.
  const raw = JSON.stringify({
    ...(o.volatile && { v: 1 }),
    ...(o.from && { f: o.from }),
    ...(o.exceptSelf && { x: 1 }),
    ...(o.to && { t: o.to }),
    n: name,
    m: message,
  })
  if (raw.length > h.limits.message)
    throw new StartError(
      'R008',
      `a \`${fn.$id}\` message is ${raw.length} bytes; a message may be ${h.limits.message}`,
      'publish less, or an id subscribers fetch',
    )
  await h.bus.publish(roomName(fn.$id, valid), raw)
}
