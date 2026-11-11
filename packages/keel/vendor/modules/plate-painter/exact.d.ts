/** A 32-bit hash of two integers. */
export declare function hash(a: number, b: number): number;
/** A stream of numbers in 0..1 from a seed and a stream name. */
export interface Draw {
    /** The next number, from 0 up to 1. */
    (): number;
    /** The next number between `low` and `high`. */
    within(low: number, high: number): number;
}
/** A stream of numbers that depends on the seed and on `stream` only. */
export declare function draws(seed: number, stream: number): Draw;
/** The smooth step of 0..1, a polynomial. */
export declare function ease(t: number): number;
/** Value noise in one dimension, 0..1, a lattice point every 1 of `x`. */
export declare function noise1(seed: number, x: number): number;
/** A unit vector turned from `x, y` by the angle whose half-tangent is `t` (-1..1 is a half turn each way). */
export declare function turn(x: number, y: number, t: number): [number, number];
/** FNV-1a over the bytes of 32-bit floats, two lanes, as 16 hex digits. */
export declare function digestOf(parts: readonly Float32Array[]): string;
