/** Sizes with O(log n) offsets (a Fenwick tree): set one, read the offset of any index, find the index at an offset. */
export class Sizes {
  private all: number[] = []
  private tree = new Float64Array(1)
  private sum = 0

  constructor(sizes: readonly number[] = []) {
    this.fill(sizes)
  }

  get length() {
    return this.all.length
  }
  get total() {
    return this.sum
  }
  get(i: number) {
    return this.all[i]
  }

  /** Replace everything, in O(n). */
  fill(sizes: readonly number[]) {
    this.all = sizes.slice()
    this.grow(this.all.length)
  }

  private grow(capacity: number) {
    const tree = new Float64Array(Math.max(capacity, 16) * 2 + 1)
    this.sum = 0
    for (let i = 1; i < tree.length; i++) {
      const size = this.all[i - 1] ?? 0
      this.sum += size
      tree[i]! += size
      const up = i + (i & -i)
      if (up < tree.length) tree[up]! += tree[i]!
    }
    this.tree = tree
  }

  set(i: number, size: number) {
    const delta = size - this.all[i]!
    if (!delta) return 0
    this.all[i] = size
    this.sum += delta
    for (let at = i + 1; at < this.tree.length; at += at & -at) this.tree[at]! += delta
    return delta
  }

  push(size: number) {
    if (this.all.length + 1 >= this.tree.length) this.grow((this.all.length + 1) * 2)
    this.all.push(0)
    this.set(this.all.length - 1, size)
  }

  /** The sum of the sizes before `i`. */
  offset(i: number) {
    let sum = 0
    for (let at = Math.min(i, this.all.length); at > 0; at -= at & -at) sum += this.tree[at]!
    return sum
  }

  /** The index whose box holds `y`, clamped to the list. */
  at(y: number) {
    const n = this.all.length
    if (!n || y <= 0) return 0
    let at = 0,
      left = y
    for (let step = 1 << (31 - Math.clz32(this.tree.length - 1)); step; step >>= 1) {
      const next = at + step
      if (next < this.tree.length && next <= n && this.tree[next]! <= left) {
        at = next
        left -= this.tree[next]!
      }
    }
    return Math.min(at, n - 1)
  }
}
