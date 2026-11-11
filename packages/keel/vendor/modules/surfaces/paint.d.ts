import { type SurfacePlan, type SurfaceSettings } from "./plan.js";
import type { SurfaceRecipe } from "./recipe.js";
/**
 * A painted surface. `buffers` is `[albedo, relief]`, each `width × height × 4` bytes, rows from the top as
 * `ImageData` holds them: the albedo in sRGB with alpha 255; the relief's normal in RGB (+x right, +y toward the top
 * row, 128 flat) and its height in A. Post it to another thread with `postMessage(surface, surface.buffers)`.
 */
export interface Surface {
    readonly digest: string;
    readonly width: number;
    readonly height: number;
    readonly buffers: [ArrayBuffer, ArrayBuffer];
}
/**
 * Paints a plan on the CPU: the shaders' arithmetic in JavaScript, the same bytes but for float rounding.
 *
 * @param plan From `planSurface`.
 * @returns The surface.
 */
export declare function paintPlan(plan: SurfacePlan): Surface;
/**
 * Paints a surface on the CPU: a recipe in, `{ digest, buffers }` out.
 *
 * @param recipe What the surface holds.
 * @param settings The seed and the size in pixels.
 * @returns The surface.
 */
export declare function paintSurface(recipe: SurfaceRecipe, settings?: SurfaceSettings): Surface;
