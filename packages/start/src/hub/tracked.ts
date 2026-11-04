/** A message with its cursor: `yield tracked(row.id, row)`, and a resumed `run` gets it as `lastEventId`. */
export class Tracked<M> {
  constructor(
    public id: string,
    public value: M,
  ) {}
}
/** A message with an id, so a stream can resume after it. */
export const tracked = <M>(id: string, value: M) => new Tracked(id, value)

/** Thrown out of `run` when its cursor can't resume: the stream restarts without one. */
export const RESET = new Error('weft.reset')
