import type { M3, Node, V3 } from "./sdf.js";
export interface Part {
    readonly name: string;
    /** Its material, one of `PARTS`. */
    readonly kind: number;
    readonly position: Float32Array;
    readonly normal: Float32Array;
    /** How open each vertex lies, 0 to 1. */
    readonly open: Float32Array;
    /** Where each vertex lies in the part's own frame, for what is painted on it. */
    readonly rest: Float32Array;
    /** A direction along the surface and a fourth number, for what has a grain (hair). */
    readonly flow?: Float32Array | undefined;
    readonly index: Uint32Array;
}
interface Placing {
    readonly turn: M3;
    readonly at: V3;
}
/** A part built in its own frame, moved into the bust's by a pose. Its rest coordinates stay its own. */
export declare function placed(part: Part, pose: Placing): Part;
/** A ball of rings and segments, as an eye; its rest coordinates are in the head's frame. */
export declare function eyeball(kind: number, ball: {
    centre: V3;
    radius: number;
}, rings: number, pose: Placing): Part;
/** The card's size: its width (1.586 : 1) and thickness, metres. */
export declare const CARD: readonly [number, number, number];
/** A card: a rounded rectangle with thickness, its rest coordinates its own (x across, y up, z through). */
export declare function cardPart(kind: number, pose: Placing): Part;
/** A fine chain laid on the body: a thin tube along `path`, pressed onto the surface of `body`. */
export declare function chainPart(kind: number, path: readonly V3[], body: Node): Part;
export {};
