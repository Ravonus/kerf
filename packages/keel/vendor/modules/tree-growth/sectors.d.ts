import type { TreeModel } from "./model.js";
/**
 * Splits a grown tree into sectors, the way a chimera plant carries whole
 * limbs of different tissue: each main limb (and everything it carries) goes
 * to one strain, so that each strain's share of the crown's leaves is close
 * to its share in `shares`. Strain 0, the first, keeps the trunk. Returns the
 * strain of every internode. A strain with too small a share for any limb
 * still gets the smallest one, so a trace of hidden makeup always shows.
 */
export declare function sectors(model: TreeModel, shares: readonly number[], seed?: number): Uint8Array;
