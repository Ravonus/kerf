/** A distance at a point. */
export type Field = (x: number, y: number, z: number) => number;
/** A point or a direction. */
export type V3 = readonly [number, number, number];
/** A rotation as three rows. */
export type M3 = readonly [number, number, number, number, number, number, number, number, number];
export interface Prim {
    readonly kind: "prim";
    /** Where it lies within: a centre and a radius (Infinity for a plane). */
    readonly bound: readonly [number, number, number, number];
    readonly f: Field;
}
export interface Op {
    readonly kind: "blend" | "carve" | "cut" | "fan";
    /** How far it melts, in metres. */
    readonly k: number;
    /** For a fan, how far each kid after the first melts into the first. */
    readonly ks?: readonly number[];
    readonly kids: readonly Node[];
    readonly bound: readonly [number, number, number, number];
}
/** A shape moved by a rotation and an offset: inside it, points are taken into the shape's own frame. */
export interface Frame {
    readonly kind: "frame";
    readonly rot: M3;
    readonly at: V3;
    readonly kid: Node;
    readonly bound: readonly [number, number, number, number];
}
/** A shape with a small field added to its distance: folds, ribs, a wave. */
export interface Bumped {
    readonly kind: "bump";
    readonly kid: Node;
    readonly f: Field;
    readonly bound: readonly [number, number, number, number];
}
export type Node = Prim | Op | Frame | Bumped;
export declare const IDENTITY: M3;
/** Smooth minimum (polynomial, quadratic): a and b melt within k. */
export declare function smin(a: number, b: number, k: number): number;
/** Smooth maximum. */
export declare function smax(a: number, b: number, k: number): number;
/** Apply a rotation's rows to a vector (into the frame) */
export declare function rotIn(m: M3, x: number, y: number, z: number): [number, number, number];
/** Apply a rotation's columns to a vector (out of the frame). */
export declare function rotOut(m: M3, x: number, y: number, z: number): [number, number, number];
/** The product of two rotations: `mul(a, b)` takes a point into b's frame, then a's. */
export declare function mul(a: M3, b: M3): M3;
/** A sphere. */
export declare function sphere(c: V3, r: number): Prim;
/** An ellipsoid with radii along its own axes, turned by `rot` (rows take a point into its frame). */
export declare function ellipsoid(c: V3, radii: V3, rot?: M3): Prim;
/** A cone with round ends: radius `ra` at `a`, `rb` at `b`. */
export declare function cone(a: V3, b: V3, ra: number, rb: number): Prim;
/** A capsule of one radius. */
export declare function capsule(a: V3, b: V3, r: number): Prim;
/** A box with rounded edges, half sizes `h`, turned by `rot`. */
export declare function box(c: V3, h: V3, round: number, rot?: M3): Prim;
/** Everything on the side of a plane its normal points away from: n·p < d. */
export declare function half(n: V3, d: number): Prim;
/** Shapes melted together within `k`. */
export declare function blend(k: number, ...kids: Node[]): Op;
/**
 * Each of `kids` melted into `base` by its own `ks`, and the union of those: fingers that melt into the palm but
 * never into each other, with the palm asked once per point.
 */
export declare function fan(base: Node, kids: readonly Node[], ks: readonly number[]): Op;
/** The first shape with the rest cut out of it, the cuts' edges melted within `k`. */
export declare function carve(k: number, base: Node, ...cuts: Node[]): Op;
/** Where every shape is: the first shape trimmed by the rest. */
export declare function cut(k: number, ...kids: Node[]): Op;
/** A shape built in its own frame, placed by `rot` (rows take a point in) and `at`. */
export declare function frame(rot: M3, at: V3, kid: Node): Frame;
/** A shape with `f` added to its distance; `amp` is the most `f` moves it. */
export declare function bump(kid: Node, f: Field, amp: number): Bumped;
