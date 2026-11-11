import type { TreeModel } from "./model.js";
import type { TreeFrame } from "./frame.js";
/**
 * Weight resting on a node of the tree (an animal on a branch), pulling it down. A negative weight lifts it, as a limb
 * springs back past rest.
 */
export interface Load {
    readonly node: number;
    readonly weight: number;
}
/**
 * How readily wood bends: each piece of the limb under a load turns by this
 * × weight × lever × its length ÷ radius⁴, as a beam does. A thin twig dips
 * under a songbird; a thick limb hardly moves under a monkey; the trunk never.
 */
export declare const WOOD_SAG = 0.000006;
/**
 * The frame with branches bent under `loads`: a bird's twig dips, a monkey's
 * limb sags, the trunk hardly moves. Pass `out` from the last call to reuse
 * its arrays (the same object comes back, so a renderer can tell it is the
 * same pose); everything but the positions is shared with `frame`. `sag` is
 * how far a unit weight bends a unit limb, the wood's own when left out.
 */
export interface BendInto {
    readonly out?: TreeFrame;
    readonly sag?: number;
}
export declare function bendFrame(model: TreeModel, frame: TreeFrame, loads: readonly Load[], into?: BendInto): TreeFrame;
