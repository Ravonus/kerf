import type { Field, Node, V3 } from "./sdf.js";
/** A mesh as flat arrays. */
export interface Surface {
    readonly position: Float32Array;
    readonly normal: Float32Array;
    /** How open each vertex lies, 0 shut to 1 open. */
    readonly open: Float32Array;
    readonly index: Uint32Array;
}
export interface Grid {
    /** The box to mesh within. */
    readonly lo: V3;
    readonly hi: V3;
    /** A cell's edge in metres. */
    readonly cell: number;
    /** How far out the openness looks, in metres; 0 for none. */
    readonly reach: number;
    /** Other shapes that shade this one but are not meshed with it. */
    readonly shade?: Node;
}
/** The field's gradient at `p`, by four samples on a tetrahedron `e` across, normalised. */
export declare function gradient(f: Field, p: readonly [number, number, number], e: number): [number, number, number];
/** Mesh a shape within a box at a cell size. */
export declare function surface(node: Node, grid: Grid): Surface;
