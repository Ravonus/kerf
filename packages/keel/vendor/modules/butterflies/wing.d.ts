/** A point of a wing's outline: x out along the span (0 at the body, 1 at the tip), y forward along the body. */
export interface WingPoint {
    readonly x: number;
    readonly y: number;
}
/** A Shape as keel/lit makes it: the parts this module calls. */
export interface ShapeLike {
    moveTo(x: number, y: number): unknown;
    bezierCurveTo(ax: number, ay: number, bx: number, by: number, x: number, y: number): unknown;
    getPoints(divisions?: number): readonly WingPoint[];
}
/**
 * The mesh. `position` is three numbers a vertex: the span out from the body (a wing's, never negative), 0, and the
 * place along the body, forward positive; a body vertex gives its own x. `wing` is two: the side (1 right, -1 left,
 * 0 the body) and the edge (0 at the root, 1 on the outline).
 */
export interface WingMesh {
    readonly position: Float32Array;
    readonly wing: Float32Array;
    readonly index: number[];
}
/**
 * Draws one wing's outline on a keel/lit Shape: a forewing reaching forward to its tip, a notch, a rounder hindwing.
 *
 * @param shape A new keel/lit Shape.
 * @param divisions Points along each curve.
 * @returns The outline, without its closing repeat.
 */
export declare function wingOutline(shape: ShapeLike, divisions?: number): WingPoint[];
/** Twice the outline's signed area: above 0 when it runs counter-clockwise in its own x and y. */
export declare function windingOf(outline: readonly WingPoint[]): number;
/**
 * A butterfly's mesh from one wing's outline: the right wing as drawn, the left its mirror, and the body.
 *
 * @param outline One wing, as `wingOutline` gives it.
 * @returns The mesh's arrays, for a keel/lit Geometry.
 */
export declare function wingMesh(outline: readonly WingPoint[]): WingMesh;
