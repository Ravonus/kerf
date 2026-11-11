export declare function createRandom(seed: number): () => number;
export declare const clamp01: (value: number) => number;
export declare const ramp: (value: number, start: number, end: number) => number;
export declare const smooth: (value: number) => number;
export declare const at: (values: ArrayLike<number>, index: number) => number;
export interface Vec {
    x: number;
    y: number;
    z: number;
}
export declare const vec: (x: number, y: number, z: number) => Vec;
export declare const add: (a: Vec, b: Vec, scale?: number) => Vec;
export declare const lengthOf: (a: Vec) => number;
export declare const cross: (a: Vec, b: Vec) => Vec;
export declare function normalize(a: Vec, fallback?: Vec): Vec;
/** Rotates `v` about the unit `axis` by `angle` radians (Rodrigues). */
export declare function rotate(v: Vec, axis: Vec, angle: number): Vec;
/** Any unit vector perpendicular to `a`. */
export declare function perpendicular(a: Vec): Vec;
