import type { Vec } from "./math.js";
export declare const GRID_X = 84;
export declare const GRID_Y = 96;
/** The shadow-propagation light field: each internode darkens a pyramid below it. */
export interface LightGrid {
    readonly shadow: Float32Array;
}
export declare function cellOf(p: Vec): number;
export declare function castShadow(grid: LightGrid, p: Vec, sign: number): void;
/** Exposure of a bud in [0, 1]: its own internode's shadow does not count. */
export declare function exposure(grid: LightGrid, p: Vec): number;
/** The direction of least shadow around `p`, leaning up. */
export declare function lightDirection(grid: LightGrid, p: Vec): Vec;
