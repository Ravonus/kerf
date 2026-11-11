import type { Surface } from "./paint.js";
import { type SurfacePlan, type SurfaceSettings } from "./plan.js";
import type { SurfaceRecipe } from "./recipe.js";
/** Paints surfaces on one context. */
export interface SurfacePainter {
    /** A recipe in, `{ digest, buffers }` out, as `paintSurface` gives on the CPU. */
    paint(recipe: SurfaceRecipe, settings?: SurfaceSettings): Surface;
    /** The same from a plan already made. */
    paintPlan(plan: SurfacePlan): Surface;
    /** Frees the programs. */
    dispose(): void;
}
/**
 * A painter on a WebGL2 context. Each kind's program compiles the first time it paints.
 *
 * @param gl The host's context. The painter restores the state it changes.
 * @returns paint, paintPlan and dispose.
 */
export declare function createSurfacePainter(gl: WebGL2RenderingContext): SurfacePainter;
