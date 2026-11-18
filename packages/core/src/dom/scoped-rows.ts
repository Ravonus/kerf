// Reconciliation of callback-local keys shares setup with a new row's deferred render.
import { clean } from '../index/graph'
import { within, type Owner } from '../index'
import { ROWBOX } from '../flags'
import { makeRow, reader, zero, type Item, type PrepareRow } from './rows'

const source = (row: Item) => (ROWBOX ? row.v : row.box.v)
type Prepared = { key: unknown; row?: Item; draw?: () => unknown }

/** Resolves each incoming key at most once, keeping setup on unchanged row inputs. */
export class ScopedRows<T> {
  readonly pending = new Set<Item>()
  private readonly byItem = new Map<unknown, Item[]>()

  constructor(
    private readonly prepare: PrepareRow<T>,
    private readonly order: Item[],
    private readonly indexed: boolean,
  ) {
    if (indexed) return
    for (let i = order.length - 1; i >= 0; i--) {
      const row = order[i]!
      const item = source(row)
      const rows = this.byItem.get(item)
      if (rows) rows.push(row)
      else this.byItem.set(item, [row])
    }
  }

  next(item: T, i: number, parent: Owner | null, available?: Map<unknown, Item>): Prepared {
    const previous = this.indexed ? this.order[i] : this.byItem.get(item)?.pop()
    // A duplicate deliberately loses its key, and a previous row claimed by an earlier item cannot be reused.
    if (
      previous &&
      Object.is(item, source(previous)) &&
      Object.is(previous.key, previous.preparedKey) &&
      available?.has(previous.key)
    )
      return { key: previous.key }

    const row = makeRow(item, undefined, parent, this.indexed ? i : undefined)
    this.pending.add(row)
    const read = reader(ROWBOX ? row : row.box) as () => T
    const index = row.index ? reader(row.index) : zero
    const { prepare } = this
    const [key, draw] = within(row, () => prepare(read, index))
    row.preparedKey = key
    return { key, row, draw }
  }

  discard(row: Item) {
    this.pending.delete(row)
    clean(row)
  }
}
