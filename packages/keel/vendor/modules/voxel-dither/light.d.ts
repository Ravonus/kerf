import type { Shading } from "./settings.js";
import type { LitLike, MaterialLike } from "./lit.js";
/**
 * God rays as a scene describes them: toward which light (a world direction), its colour, and how the shafts fall off.
 */
export interface RaySpec {
    readonly direction: readonly [number, number, number];
    readonly color: string;
    /** 0 to about 1.5. */
    readonly strength: number;
    /** Falloff per step along a shaft, 0.85 to 0.995. */
    readonly decay?: number | undefined;
    /** How much of the way to the light a shaft samples, 0.2 to 1. */
    readonly density?: number | undefined;
}
/** Where a light direction lands on screen: uv (0..1, may fall outside) and how squarely the camera faces it (0..1). */
export interface ScreenLight {
    readonly x: number;
    readonly y: number;
    readonly facing: number;
}
/**
 * Projects a world direction (a light at infinity) through a camera's view
 * and projection matrices (column-major, as keel/lit keeps them).
 */
export declare function screenLight(view: ArrayLike<number>, projection: ArrayLike<number>, direction: readonly [number, number, number]): ScreenLight;
interface CelShader {
    setBands(bands: number): void;
    swap(material: MaterialLike, mode: Shading): MaterialLike;
    dispose(): void;
}
export declare function createCelShader(lit: LitLike, bands: number): CelShader;
export {};
