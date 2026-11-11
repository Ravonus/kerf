/** A 32-bit hash of two integers. The shaders' `hh` is the same function. */
export declare function hash(a: number, b: number): number;
/** A stream of numbers between `low` and `high` that depends on the seed and on `stream` only. */
export declare function draws(seed: number, stream: number): (low: number, high: number) => number;
/** The unit vector along `x, y`, turned by the angle whose half-tangent is `t`. */
export declare function turn(x: number, y: number, t?: number): [number, number];
/** FNV-1a over the bytes of 32-bit floats, two lanes, as 16 hex digits. */
export declare function digestOf(parts: readonly Float32Array[]): string;
