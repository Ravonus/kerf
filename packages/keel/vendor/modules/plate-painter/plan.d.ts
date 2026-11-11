import type { PlateRecipe } from "./recipe.js";
/** Bumped whenever the passes paint the same plan differently, so a cached plate of an older painter is not reused. */
export declare const PAINTER_VERSION = 1;
/** Crest samples across the plate for each range. */
export declare const RIDGE_SAMPLES = 512;
/** The most ranges a plate holds. */
export declare const MAX_RANGES = 4;
/** What the host may change when it includes the module (keel.module.json's inputs). */
export interface PlateSettings {
    /** Decides every shape. A whole number from 0. */
    readonly seed?: number;
    /** Scales every depth step toward the haze, 0..2; 1 is the recipe's air. */
    readonly haze?: number;
    /** Moves the clouds' cover, -0.5 (clearer) .. 0.5 (heavier). */
    readonly clouds?: number;
    /** False leaves the near leaves out. */
    readonly foliage?: boolean;
}
/** One uniform: its name, its components (1..4) and its values (several for an array). */
export type PlanUniform = readonly [name: string, size: 1 | 2 | 3 | 4, values: Float32Array];
/** Everything the GPU paints from. */
export interface PlatePlan {
    readonly digest: string;
    /** Width over height of the whole plate. */
    readonly aspect: number;
    readonly uniforms: readonly PlanUniform[];
    /** Crest y of each range, RIDGE_SAMPLES across, one row a range (MAX_RANGES rows). */
    readonly ridges: Float32Array;
    /** The middle distance's dabs, drawn under the brush strokes. */
    readonly scene: Float32Array;
    /** The near leaves, drawn over the brush strokes. */
    readonly foliage: Float32Array;
}
/**
 * The plan for a recipe and settings: uniforms, crests and dabs, with their digest.
 *
 * @param recipe What the plate holds (LAKE_VALLEY, or one of your own).
 * @param settings The seed and the host's settings.
 * @returns The plan; `paint` it with a painter from `createPlatePainter`.
 * @throws RangeError on a recipe or setting out of range.
 */
export declare function planPlate(recipe: PlateRecipe, settings?: PlateSettings): PlatePlan;
