export declare const TAU: number;
export declare const clamp: (value: number, low: number, high: number) => number;
export declare const at: (array: ArrayLike<number>, index: number) => number;
export declare function smoothstep(edge0: number, edge1: number, value: number): number;
/** A stable 32-bit hash. */
export declare function hash32(value: number): number;
/** A small seeded stream (mulberry32). */
export declare function seededRandom(seed: number): () => number;
