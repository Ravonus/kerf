import type { GeometryLike, LitLike, MaterialLike, TreeColors, TreeModelLike, YearLike } from "../inputs.js";
import type { ForestVariant } from "./forest.js";
export interface Vector4Like {
    x: number;
    y: number;
    z: number;
    w: number;
}
/**
 * What a tree is cut down to at one level: real wood down to `wood`, up to `leaves` real leaves (`fill` blades each
 * when they are few), and, for `clumps`, the crown's own masses as lumps under them.
 */
export interface RungSpec {
    readonly wood: number;
    readonly sides: number;
    readonly leaves: number;
    readonly fill: number;
    /** Blades smaller than the bake's, which draws fewer and larger. */
    readonly leafSize?: number;
    /** Flat needles on each conifer sprig. */
    readonly needles: number;
    readonly clumps: number;
}
/** Card size: half width, height, and the base's drop below the origin. */
export interface Box {
    readonly half: number;
    readonly height: number;
    readonly base: number;
}
export declare function bakedGeometry(lit: LitLike, variant: ForestVariant, spec: RungSpec): GeometryLike;
export declare function boxOf(geometry: GeometryLike): Box;
export declare function seasonUniforms(lit: LitLike, colors: TreeColors): Record<string, {
    value: unknown;
}>;
/** A standard material that keeps the season on the GPU, sways, and dithers out by distance and near the lens. */
export declare function forestMaterial(lit: LitLike, uniforms: Record<string, {
    value: unknown;
}>, card: boolean): MaterialLike;
export declare function setYear(uniforms: Record<string, {
    value: unknown;
}>, year: YearLike, model: TreeModelLike, colors: TreeColors): void;
