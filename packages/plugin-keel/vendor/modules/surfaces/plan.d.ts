import { type PlannedRecipe, type SurfaceRecipe } from "./recipe.js";
/** Moves whenever the painters would paint the same plan differently, so a stored surface is not reused wrongly. */
export declare const PAINTER_VERSION = 1;
/** The most masses a painted ground holds. */
export declare const MAX_MASSES = 10;
/** Floats in a plan's uniforms. */
export declare const UNIFORMS = 232;
/** Each kind's number, as the digest and the shaders know it. */
export declare const KINDS: {
    readonly paper: 0;
    readonly knit: 1;
    readonly painted: 2;
};
/** The size and seed to paint at. */
export interface SurfaceSettings {
    /** A whole number from 0. Default 0. */
    readonly seed?: number;
    /** Pixels, 1..4096. Default 1024; the height defaults to the width. */
    readonly width?: number;
    readonly height?: number;
}
/** Everything a painter needs, worked out in exact arithmetic. */
export interface SurfacePlan {
    readonly kind: SurfaceRecipe["kind"];
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly uniforms: Float32Array;
    /** Covers the uniforms, the kind, the size, the depth and `PAINTER_VERSION`. */
    readonly digest: string;
}
/**
 * Plans a surface: validates the recipe and settings and works out every number the painters read.
 *
 * @param recipe What the surface holds.
 * @param settings The seed and the size in pixels.
 * @returns The plan, with its digest.
 */
export declare function planSurface(recipe: SurfaceRecipe | PlannedRecipe, settings?: SurfaceSettings): SurfacePlan;
