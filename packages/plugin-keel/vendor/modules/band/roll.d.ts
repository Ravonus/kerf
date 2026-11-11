/** Seeded randomness for the band: one hash, one generator, one safe list read. MIT. */
/** A 32-bit number for any seed: a number is used as it is, text is hashed. */
export declare function seedNumber(seed: number | string): number;
/** Mixes whole numbers into one 32-bit hash, so a seed, a bar and a part give their own stream. */
export declare function mixHash(...parts: readonly number[]): number;
/** A number in [0, 1) for a hash, the same every time. */
export declare const unit: (hash: number) => number;
/** A generator of numbers in [0, 1) from a seed (mulberry32). */
export declare function random(seed: number): () => number;
/** The item at an index, wrapped round the list. Throws on an empty list. */
export declare function at<T>(list: readonly T[], index: number): T;
/** The item a roll in [0, 1) lands on. */
export declare const pick: <T>(list: readonly T[], roll: number) => T;
export declare const clamp: (value: number, min: number, max: number) => number;
