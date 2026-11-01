// Speed paths. Each one is the same behaviour, faster on some work and paid for in bytes, and each can be turned off
// to measure it: `weft({ off: ['SWAP'] })`, or `WEFT_OFF=SWAP,TEXT` for a whole run (`all` for every one). The suite
// passes both ways, and evals/speed/lab.mjs prices each. docs/research/39-speed-lab.md records why each stayed.

/** A re-run keeps the links of the sources it reads again, in order. */
export const REUSE = true
/** Graph lists of one or two are written as literals. */
export const LITERAL = true
/** A manual `flush` leaves a queued microtask in place rather than queueing another. */
export const MICRO = true
/** Unlinking from the end of a list pops, and a full unlink doesn't touch the old list. */
export const POP = true
/** Keyed writes compare the object's keys when there are far more readers than keys. */
export const OWNKEYS = true
/** `For` finds rows that stayed at either end by position, with no Map. */
export const ENDS = true
/** Two rows or nodes that traded places cost two moves, and no longest-run search. */
export const SWAP = true
/** A row is its item's box, not a row and a box. */
export const ROWBOX = true
/** Rows are checked for repeated keys when a later pass could keep them, not as they're made. */
export const DEFER = true
/** Rows of one element reach `place` as they are, not through `resolve`. */
export const FLAT = true
/** A hole that's its parent's only child writes `textContent`. */
export const TEXT = true
/** Emptying a parent the hole fills is one `textContent` write. */
export const WIPE = true
/** A pass that moves nothing already placed doesn't look for what was. */
export const SCAN = true
/** Up to 8 rows between the ends are matched by scanning, with no Map to build. */
export const LINEAR = true
/** A row's key is read once as the row is made, not through its item in every binding (crates/weft-compiler, `hoist_key`). */
export const KEYREAD = true
/** Keys that only rise skip the check for repeats. */
export const SORTED = true
/** A delegated handler that's a function is one property write, not two calls (crates/weft-compiler). */
export const EVENT = true
