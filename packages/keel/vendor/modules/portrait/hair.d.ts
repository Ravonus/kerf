import type { Field, M3, V3 } from "./sdf.js";
import type { CapFrame } from "./cap.js";
export interface HairRecipe {
    readonly seed: number;
    /** How many locks, and the rings and segments of each. */
    readonly locks: number;
    readonly segments: number;
    readonly sides: number;
    /** How long the hair falls, in metres. */
    readonly length: number;
}
/** Where the head sits in the bust: hair is built in the bust's frame, its roots placed by the head. */
export interface HairPlace {
    readonly turn: M3;
    readonly at: V3;
}
/** The locks as tubes: position, normal, rest (round the tube, along it, the lock's tone) and flow (the tangent). */
export interface HairMesh {
    readonly position: Float32Array;
    readonly normal: Float32Array;
    readonly rest: Float32Array;
    readonly flow: Float32Array;
    readonly open: Float32Array;
    readonly index: Uint32Array;
}
export declare function hairMesh(recipe: HairRecipe, cap: CapFrame, body: Field, place: HairPlace): HairMesh;
