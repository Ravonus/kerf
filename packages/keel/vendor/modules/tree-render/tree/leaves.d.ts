import type { InstancedLike, SlotsLike, TreeFrameLike, TreeModelLike } from "../inputs.js";
import type { V3 } from "../instances.js";
import type { Tick, Tree } from "./tree.js";
/**
 * A palm frond as its leaflets: two even rows down the rachis, one each side,
 * short at the frond's base, longest a third of the way out and short again at
 * its tip. Per leaflet: how far along its internode it grows, which side, and
 * how far out along the whole frond that is.
 */
export interface FrondLayout {
    readonly along: Float32Array;
    readonly side: Float32Array;
    readonly out: Float32Array;
    readonly pieces: Float32Array;
}
export declare function frondLayout(model: TreeModelLike): FrondLayout | null;
/** Where a conifer sprig sits: somewhere along its twig, pointing the way the twig grows, a little off it. */
export declare function sprigPlace(frame: TreeFrameLike, slots: TreeModelLike["leaves"], index: number): {
    p: V3;
    n: V3;
};
export declare function poseLeaves(tree: Tree, mesh: InstancedLike, tick: Tick): void;
/**
 * How lit each leaf is by its place in the crown: leaves deep inside and low
 * down sit in the crown's own shade, the outer and upper ones catch the light,
 * and each varies a little on its own. Without it a crown is one flat colour.
 */
export declare function crownShade(frame: TreeFrameLike, slots: SlotsLike, jitter?: (index: number) => number): Float32Array;
export declare function paintLeaves(tree: Tree, mesh: InstancedLike, tick: Tick): void;
