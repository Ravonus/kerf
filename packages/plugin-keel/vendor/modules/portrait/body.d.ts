import type { Node, V3 } from "./sdf.js";
/** Where the raised arm goes: the shoulder, the elbow and the wrist, and the hanging arm's elbow. */
export interface Arms {
    readonly shoulder: V3;
    readonly elbow: V3;
    readonly wrist: V3;
    readonly hanging: V3;
}
export declare const ARMS: Arms;
/** The neck and the shoulders' slope, which the skin and cloth share. */
export declare function neckShape(): Node;
/** The torso and arms, grown by `grow`. */
export declare function torso(arms: Arms, grow: number): Node;
/** The forearm of the raised arm, grown by `grow`. */
export declare function forearm(arms: Arms, grow: number): Node;
/** A wave a turn long, -1 to 1: round on its ridges, creased in its valleys, from arithmetic alone. */
export declare function wave(turns: number): number;
/** The chemise: a white layer just over the skin, gathered at its top edge. */
export declare function chemiseShape(arms: Arms): Node;
/** The dress: a layer over the chemise with a square neckline, and its sleeve on the raised forearm. */
export declare function dressShape(arms: Arms): Node;
/** The over-gown: velvet over the shoulders and arms, open down the front, with wide sleeves. */
export declare function gownShape(arms: Arms): Node;
/** The chain's path: from behind the neck, round over the collarbones, low on the chest in front. */
export declare function chainPath(n: number): V3[];
